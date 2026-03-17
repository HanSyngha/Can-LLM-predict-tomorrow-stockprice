import React, { useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useTranslate } from '../../hooks/useTranslate';
import { renderMarkdown } from '../../lib/markdown';
import type { Prediction } from '../../lib/types';

interface PredictionDetailProps {
  prediction: Prediction;
}

function TranslateToggle({
  text,
  className,
  renderContent,
}: {
  text: string;
  className?: string;
  renderContent: (displayText: string) => React.ReactNode;
}) {
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
    const result = await translate(text, 'ko');
    setTranslatedText(result);
    setShowTranslated(true);
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
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
      {renderContent(showTranslated && translatedText ? translatedText : text)}
    </div>
  );
}

export function PredictionDetail({ prediction }: PredictionDetailProps) {
  const { t } = useI18n();

  let searchReports: string[] = [];
  if (prediction.search_reports) {
    try {
      const parsed = JSON.parse(prediction.search_reports);
      if (Array.isArray(parsed)) {
        searchReports = parsed.map((r) => (typeof r === 'string' ? r : String(r)));
      } else if (typeof parsed === 'string') {
        searchReports = [parsed];
      }
    } catch {
      searchReports = [prediction.search_reports];
    }
  }

  return (
    <tr className="bg-slate-50 dark:bg-[#1c1c1e] animate-slide-down">
      <td className="px-4 sm:px-8 py-6" colSpan={7}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* LLM Reasoning */}
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 mb-2 tracking-wider">
              {t('detail.llmThoughtProcess')}
            </h4>
            {prediction.reasoning ? (
              <TranslateToggle
                text={prediction.reasoning}
                renderContent={(displayText) => (
                  <div
                    className="text-slate-700 dark:text-slate-300 leading-relaxed border-l-4 border-slate-300 dark:border-slate-600 pl-4 custom-scrollbar max-h-60 overflow-y-auto prose-sm"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }}
                  />
                )}
              />
            ) : (
              <p className="text-slate-400 dark:text-slate-500 text-sm italic">{t('common.noData')}</p>
            )}
          </div>

          {/* Search Reports */}
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 mb-2 tracking-wider">
              {t('detail.searchReportsAnalyzed')}
            </h4>
            {searchReports.length > 0 ? (
              <TranslateToggle
                text={searchReports.join('\n\n---\n\n')}
                renderContent={(displayText) => {
                  const parts = displayText.split('\n\n---\n\n');
                  return (
                    <ul className="text-xs space-y-2 custom-scrollbar max-h-60 overflow-y-auto">
                      {parts.map((report, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-1.5 shrink-0" />
                          <span
                            className="leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
                          />
                        </li>
                      ))}
                    </ul>
                  );
                }}
              />
            ) : (
              <p className="text-slate-400 dark:text-slate-500 text-sm italic">{t('common.noData')}</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
