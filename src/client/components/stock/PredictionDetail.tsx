import React, { useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { renderMarkdown } from '../../lib/markdown';
import type { Prediction } from '../../lib/types';

interface PredictionDetailProps {
  prediction: Prediction;
}

function LangTabs({ activeTab, onChange, hasKo }: { activeTab: 'en' | 'ko'; onChange: (t: 'en' | 'ko') => void; hasKo: boolean }) {
  return (
    <div className="inline-flex items-center bg-slate-100 dark:bg-[#2c2c2e] rounded-md p-0.5 mb-2">
      <button
        onClick={() => onChange('en')}
        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
          activeTab === 'en'
            ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => onChange('ko')}
        disabled={!hasKo}
        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
          activeTab === 'ko'
            ? 'bg-white dark:bg-[#48484a] text-slate-900 dark:text-white shadow-sm'
            : hasKo
              ? 'text-slate-500 dark:text-slate-400'
              : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
      >
        KO {!hasKo && <span className="text-[8px]">...</span>}
      </button>
    </div>
  );
}

function parseReports(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(r => typeof r === 'string' ? r : String(r));
    if (typeof parsed === 'string') return [parsed];
  } catch {
    return [raw];
  }
  return [];
}

export function PredictionDetail({ prediction }: PredictionDetailProps) {
  const { t } = useI18n();
  const [reasoningLang, setReasoningLang] = useState<'en' | 'ko'>(prediction.reasoning_ko ? 'ko' : 'en');
  const [reportsLang, setReportsLang] = useState<'en' | 'ko'>(prediction.search_reports_ko ? 'ko' : 'en');

  const searchReportsEn = parseReports(prediction.search_reports);
  const searchReportsKo = parseReports(prediction.search_reports_ko);

  const reasoningText = reasoningLang === 'ko' && prediction.reasoning_ko
    ? prediction.reasoning_ko
    : prediction.reasoning;

  const activeReports = reportsLang === 'ko' && searchReportsKo.length > 0
    ? searchReportsKo
    : searchReportsEn;

  return (
    <tr className="bg-slate-50 dark:bg-[#1c1c1e] animate-slide-down">
      <td className="px-3 sm:px-8 py-3 sm:py-6" colSpan={7}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          {/* LLM Reasoning */}
          <div>
            <h4 className="text-[10px] sm:text-xs font-bold uppercase text-slate-400 dark:text-slate-500 mb-1 tracking-wider">
              {t('detail.llmThoughtProcess')}
            </h4>
            {prediction.reasoning ? (
              <>
                <LangTabs activeTab={reasoningLang} onChange={setReasoningLang} hasKo={!!prediction.reasoning_ko} />
                <div
                  className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-l-4 border-slate-300 dark:border-slate-600 pl-3 sm:pl-4 custom-scrollbar max-h-60 overflow-y-auto [&_p]:mt-1 [&_br+br]:hidden"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(reasoningText || '') }}
                />
              </>
            ) : (
              <p className="text-slate-400 dark:text-slate-500 text-xs italic">{t('common.noData')}</p>
            )}
          </div>

          {/* Search Reports */}
          <div>
            <h4 className="text-[10px] sm:text-xs font-bold uppercase text-slate-400 dark:text-slate-500 mb-1 tracking-wider">
              {t('detail.searchReportsAnalyzed')}
            </h4>
            {searchReportsEn.length > 0 ? (
              <>
                <LangTabs activeTab={reportsLang} onChange={setReportsLang} hasKo={searchReportsKo.length > 0} />
                <ul className="text-xs space-y-2 custom-scrollbar max-h-60 overflow-y-auto">
                  {activeReports.map((report, i) => (
                    <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-1.5 shrink-0" />
                      <span
                        className="leading-relaxed [&_p]:mt-1 [&_br+br]:hidden"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-slate-400 dark:text-slate-500 text-xs italic">{t('common.noData')}</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
