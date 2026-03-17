import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n } from '../contexts/I18nContext';
import { useApi } from '../hooks/useApi';
import { useTranslate } from '../hooks/useTranslate';
import { notesApi, llmsApi } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import type { Note, LLMConfig } from '../lib/types';

function NoteTranslateToggle({ content }: { content: string }) {
  const { t } = useI18n();
  const { translate, isTranslating } = useTranslate();
  const [showTranslated, setShowTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);

  const handleToggle = async () => {
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translatedText) {
      setShowTranslated(true);
      return;
    }
    const result = await translate(content, 'ko');
    setTranslatedText(result);
    setShowTranslated(true);
  };

  const displayText = showTranslated && translatedText ? translatedText : content;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={handleToggle}
          disabled={isTranslating}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition-all cursor-pointer disabled:opacity-50 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2c2c2e]"
        >
          {isTranslating ? (
            t('translate.translating')
          ) : showTranslated ? (
            <>EN <span className="text-[8px]">|</span> <span className="font-black">KO</span></>
          ) : (
            <><span className="font-black">EN</span> <span className="text-[8px]">|</span> KO</>
          )}
        </button>
      </div>
      <div
        className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }}
      />
    </div>
  );
}

export function Notes() {
  const { t } = useI18n();
  const [selectedLLM, setSelectedLLM] = useState<string | undefined>(undefined);

  const { data: llmConfigs } = useApi<LLMConfig[]>(
    () => llmsApi.getAll(),
    []
  );

  // Determine which LLM to show - default to first active if none selected
  const activeLLMs = llmConfigs?.filter(c => c.isActive) || [];
  const effectiveLLM = selectedLLM || (activeLLMs.length > 0 ? activeLLMs[0]!.id : undefined);

  const { data: notes, loading } = useApi<Note[]>(
    () => notesApi.getAll(effectiveLLM),
    [effectiveLLM]
  );

  // Build slot map
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6 animate-fade-in">
          {/* LLM selector tabs */}
          {activeLLMs.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400 shrink-0">
                {t('detail.llmFilter')}:
              </span>
              {activeLLMs.map((config) => (
                <button
                  key={config.id}
                  onClick={() => setSelectedLLM(config.id)}
                  className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-all duration-200 ease-out shrink-0 cursor-pointer ${
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

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Spinner size="lg" />
            </div>
          )}

          {/* Empty state */}
          {!loading && nonEmptySlots.length === 0 && (
            <EmptyState
              title={t('notes.emptyTitle')}
              description={t('notes.emptyDescription')}
            />
          )}

          {/* Note list */}
          {!loading && nonEmptySlots.length > 0 && (
            <div className="space-y-4">
              {nonEmptySlots.map((slotNum) => {
                const note = noteMap.get(slotNum)!;
                return (
                  <Card key={slotNum} className="p-5">
                    <div className="flex items-start gap-4">
                      <Badge variant="neutral">
                        #{slotNum}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <NoteTranslateToggle content={note.content || ''} />
                        {note.last_updated_by && (
                          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                            {t('notes.lastUpdatedBy')}: <span className="font-mono">{note.last_updated_by}</span>
                          </p>
                        )}
                        {note.last_updated_at && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {note.last_updated_at}
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
