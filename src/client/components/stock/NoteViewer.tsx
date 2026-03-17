import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { useI18n } from '../../contexts/I18nContext';
import { useApi } from '../../hooks/useApi';
import { notesApi } from '../../lib/api';
import type { Note } from '../../lib/types';

interface NoteViewerProps {
  llmId?: string;
}

export function NoteViewer({ llmId }: NoteViewerProps) {
  const { t } = useI18n();
  const { data: notes, loading } = useApi<Note[]>(() => notesApi.getAll(llmId), [llmId]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Card>
    );
  }

  // Build 50 slots
  const noteMap = new Map<number, Note>();
  if (notes) {
    for (const note of notes) {
      noteMap.set(note.slot_number, note);
    }
  }

  const slots = Array.from({ length: 50 }, (_, i) => i + 1);

  return (
    <Card padding={false}>
      <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2c2c2e]">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          {t('detail.notes')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {t('detail.notesDescription')}
        </p>
      </div>
      <div className="p-4 grid grid-cols-5 min-[400px]:grid-cols-7 sm:grid-cols-10 gap-2">
        {slots.map((slot) => {
          const note = noteMap.get(slot);
          const hasContent = note?.content && note.content.trim() !== '';
          const isActive = activeSlot === slot;

          return (
            <div
              key={slot}
              className="relative"
            >
              <div
                onClick={() => hasContent && setActiveSlot(isActive ? null : slot)}
                className={`
                  h-10 rounded-lg flex items-center justify-center text-xs font-bold
                  transition-all
                  ${hasContent ? 'cursor-pointer' : 'cursor-default'}
                  ${
                    hasContent
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                      : 'bg-slate-50 dark:bg-[#2c2c2e] text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-[#38383a]'
                  }
                `}
              >
                {slot}
              </div>
              {/* Tooltip - click/tap toggle */}
              {hasContent && isActive && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs rounded-lg shadow-lg z-10 max-w-[calc(100vw-2rem)] w-64">
                  <p className="leading-relaxed line-clamp-4">{note!.content}</p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                    <div className="w-2 h-2 bg-slate-900 dark:bg-white rotate-45" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
