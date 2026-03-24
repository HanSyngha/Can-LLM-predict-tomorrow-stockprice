import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n } from '../contexts/I18nContext';
import { useApi } from '../hooks/useApi';
import { notesApi, intradayNotesApi, llmsApi } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import type { Note, LLMConfig } from '../lib/types';

function NoteLangTabs({ note }: { note: Note }) {
  const [lang, setLang] = useState<'en' | 'ko'>(note.content_ko ? 'ko' : 'en');
  const hasKo = !!note.content_ko;
  const text = lang === 'ko' && note.content_ko ? note.content_ko : (note.content || '');

  return (
    <div>
      <div className="inline-flex items-center bg-slate-100 dark:bg-[#2c2c2e] rounded-md p-0.5 mb-2">
        <button
          onClick={() => setLang('en')}
          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
            lang === 'en'
              ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => setLang('ko')}
          disabled={!hasKo}
          className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
            lang === 'ko'
              ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
              : hasKo
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
          }`}
        >
          KO {!hasKo && <span className="text-[8px]">...</span>}
        </button>
      </div>
      <div
        className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed [&_p]:mt-1 [&_br+br]:hidden"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      />
    </div>
  );
}

export function Notes() {
  const { t } = useI18n();
  const [selectedLLM, setSelectedLLM] = useState<string | undefined>(undefined);
  const [noteType, setNoteType] = useState<'daily' | 'intraday'>('daily');

  const { data: llmConfigs } = useApi<LLMConfig[]>(
    () => llmsApi.getAll(),
    []
  );

  const activeLLMs = llmConfigs?.filter(c => c.isActive) || [];
  const effectiveLLM = selectedLLM || (activeLLMs.length > 0 ? activeLLMs[0]!.id : undefined);

  const { data: notes, loading } = useApi<Note[]>(
    () => noteType === 'daily' ? notesApi.getAll(effectiveLLM) : intradayNotesApi.getAll(effectiveLLM),
    [effectiveLLM, noteType]
  );

  const noteMap = new Map<number, Note>();
  if (notes) {
    for (const note of notes) {
      noteMap.set(note.slot_number, note);
    }
  }

  const slots = Array.from({ length: 50 }, (_, i) => i + 1);
  const nonEmptySlots = slots.filter(s => {
    const note = noteMap.get(s);
    return note?.content && note.content.trim() !== '';
  });

  return (
    <>
      <Header title={t('notes.title')} subtitle={t('notes.subtitle')} showBack />
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-8">
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
          {/* Daily / Intraday toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#2c2c2e] rounded-lg p-1 w-fit">
            <button
              onClick={() => setNoteType('daily')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all ${
                noteType === 'daily'
                  ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t('notes.dailyTab')}
            </button>
            <button
              onClick={() => setNoteType('intraday')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-md transition-all ${
                noteType === 'intraday'
                  ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t('notes.intradayTab')}
            </button>
          </div>

          {activeLLMs.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
              <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 shrink-0">
                {t('detail.llmFilter')}:
              </span>
              {activeLLMs.map((config) => (
                <button
                  key={config.id}
                  onClick={() => setSelectedLLM(config.id)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all shrink-0 ${
                    effectiveLLM === config.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                      : 'bg-slate-100 dark:bg-[#2c2c2e] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#3a3a3c]'
                  }`}
                >
                  {config.name}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-24">
              <Spinner size="lg" />
            </div>
          )}

          {!loading && nonEmptySlots.length === 0 && (
            <EmptyState
              title={t('notes.emptyTitle')}
              description={t('notes.emptyDescription')}
            />
          )}

          {!loading && nonEmptySlots.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              {nonEmptySlots.map((slotNum) => {
                const note = noteMap.get(slotNum)!;
                return (
                  <Card key={slotNum}>
                    <div className="flex items-start gap-2 sm:gap-4">
                      <Badge variant="neutral">
                        #{slotNum}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <NoteLangTabs note={note} />
                        {note.last_updated_by && (
                          <p className="mt-2 text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">
                            {t('notes.lastUpdatedBy')}: <span className="font-mono">{note.last_updated_by}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
