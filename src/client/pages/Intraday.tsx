import React from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { AccuracyLineChart } from '../components/charts/AccuracyLineChart';
import { useI18n } from '../contexts/I18nContext';
import { useApi } from '../hooks/useApi';
import { intradayApi } from '../lib/api';
import type { IntradaySummary, IntradayTodayEntry, AccuracyHistoryEntry } from '../lib/types';

const DIR_COLORS: Record<string, string> = {
  UP: 'text-emerald-600 dark:text-emerald-400',
  DOWN: 'text-rose-600 dark:text-rose-400',
  FLAT: 'text-slate-500 dark:text-slate-400',
  UNABLE: 'text-slate-400 dark:text-slate-500',
};

const DIR_BG: Record<string, string> = {
  UP: 'bg-emerald-50 dark:bg-emerald-900/20',
  DOWN: 'bg-rose-50 dark:bg-rose-900/20',
  FLAT: 'bg-slate-50 dark:bg-slate-800/50',
  UNABLE: 'bg-slate-50 dark:bg-slate-800/50',
};

const LLM_GRADIENTS = [
  'bg-gradient-to-r from-blue-500 to-blue-400',
  'bg-gradient-to-r from-emerald-500 to-emerald-400',
  'bg-gradient-to-r from-amber-500 to-amber-400',
  'bg-gradient-to-r from-rose-500 to-rose-400',
  'bg-gradient-to-r from-violet-500 to-violet-400',
];

const LLM_TEXT_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-amber-600 dark:text-amber-400',
  'text-rose-600 dark:text-rose-400',
  'text-violet-600 dark:text-violet-400',
];

const LLM_BG_LIGHT = [
  'bg-blue-50 dark:bg-blue-900/20',
  'bg-emerald-50 dark:bg-emerald-900/20',
  'bg-amber-50 dark:bg-amber-900/20',
  'bg-rose-50 dark:bg-rose-900/20',
  'bg-violet-50 dark:bg-violet-900/20',
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatPrice(p: number | null): string {
  if (p === null) return '-';
  return p >= 1000 ? p.toLocaleString() : p.toFixed(2);
}

export function Intraday() {
  const { t } = useI18n();

  const { data: summary, loading: summaryLoading } = useApi<IntradaySummary>(
    () => intradayApi.getSummary(),
    []
  );
  const { data: today, loading: todayLoading } = useApi<IntradayTodayEntry[]>(
    () => intradayApi.getToday(),
    []
  );
  const { data: history } = useApi<AccuracyHistoryEntry[]>(
    () => intradayApi.getAccuracyHistory(),
    []
  );

  const loading = summaryLoading || todayLoading;

  // Build LLM index for consistent coloring
  const llmIndex: Record<string, number> = {};
  if (summary?.llmAccuracies) {
    summary.llmAccuracies.forEach((llm, idx) => {
      llmIndex[llm.llmId] = idx;
    });
  }

  return (
    <>
      <Header />
      <main className="w-full px-5 sm:px-8 lg:px-10 py-6 sm:py-8 pb-20 md:pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-8 animate-fade-in">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('intraday.title')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">{t('intraday.subtitle')}</p>
            </div>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <Card className="!p-2.5 sm:!p-5 border-t-2 border-t-indigo-500">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('intraday.overallAccuracy')}
                </p>
                <p className={`text-lg sm:text-3xl font-black mt-0.5 sm:mt-1 ${
                  (summary?.overallAccuracy ?? 0) >= 60
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-800 dark:text-white'
                }`}>
                  {summary ? `${summary.overallAccuracy.toFixed(1)}%` : '-'}
                </p>
              </Card>
              <Card className="!p-2.5 sm:!p-5 border-t-2 border-t-blue-500">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('intraday.todayPredictions')}
                </p>
                <p className="text-lg sm:text-3xl font-black text-slate-800 dark:text-white mt-0.5 sm:mt-1">
                  {summary?.todayPredictions ?? 0}
                </p>
              </Card>
              <Card className="!p-2.5 sm:!p-5 border-t-2 border-t-emerald-500">
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('intraday.todayCorrect')}
                </p>
                <p className="text-lg sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 sm:mt-1">
                  {summary?.todayCorrect ?? 0}
                </p>
              </Card>
            </div>

            {/* LLM Comparison Bars */}
            {summary?.llmAccuracies && summary.llmAccuracies.length > 0 && (
              <Card>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                    {t('dashboard.llmComparison')}
                  </h2>
                </div>
                <div className="space-y-2 sm:space-y-3">
                  {summary.llmAccuracies.map((llm, idx) => {
                    const gradientClass = LLM_GRADIENTS[idx % LLM_GRADIENTS.length];
                    const textColorClass = LLM_TEXT_COLORS[idx % LLM_TEXT_COLORS.length];
                    const barWidth = Math.max(llm.accuracy, 2);
                    return (
                      <div key={llm.llmId} className="flex items-center gap-2 sm:gap-4">
                        <div className="w-20 sm:w-28 shrink-0 text-right">
                          <p className={`text-xs sm:text-sm font-bold ${textColorClass}`}>{llm.llmName}</p>
                        </div>
                        <div className="flex-1">
                          <div className="relative h-6 sm:h-8 bg-slate-100 dark:bg-[#2c2c2e] rounded-full overflow-hidden">
                            <div
                              className={`absolute left-0 top-0 h-full ${gradientClass} rounded-full transition-all duration-500 ease-out`}
                              style={{ width: `${barWidth}%` }}
                            />
                            <div className="absolute inset-0 flex items-center px-2 sm:px-3">
                              <span className="text-[10px] sm:text-xs font-bold text-white drop-shadow-sm">
                                {llm.accuracy.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="w-10 sm:w-20 shrink-0 text-right">
                          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            {llm.totalCorrect}/{llm.totalPredictions}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Today's cumulative accuracy by time slot */}
            {today && today.length > 0 && (() => {
              // Collect all graded predictions, sort by time slot
              const allPreds = today.flatMap(e => e.predictions)
                .filter(p => p.is_correct !== null)
                .sort((a, b) => (a.prediction_hour * 60 + a.prediction_minute) - (b.prediction_hour * 60 + b.prediction_minute));

              if (allPreds.length === 0) return null;

              // Build cumulative accuracy per time slot
              const slotMap = new Map<string, { total: number; correct: number }>();
              for (const p of allPreds) {
                const key = `${pad(p.prediction_hour)}:${pad(p.prediction_minute)}`;
                const entry = slotMap.get(key) || { total: 0, correct: 0 };
                entry.total++;
                if (p.is_correct === 1) entry.correct++;
                slotMap.set(key, entry);
              }

              let cumTotal = 0;
              let cumCorrect = 0;
              const chartData: Array<{ date: string; total_predictions: number; total_correct: number; accuracy_rate: number }> = [];
              for (const [slot, stats] of slotMap) {
                cumTotal += stats.total;
                cumCorrect += stats.correct;
                chartData.push({
                  date: slot,
                  total_predictions: cumTotal,
                  total_correct: cumCorrect,
                  accuracy_rate: cumTotal > 0 ? (cumCorrect / cumTotal) * 100 : 0,
                });
              }

              return chartData.length > 1 ? (
                <Card>
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                      {t('intraday.accuracyTrend')}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('intraday.accuracyTrendDesc')} ({cumCorrect}/{cumTotal})
                    </p>
                  </div>
                  <AccuracyLineChart data={chartData} />
                </Card>
              ) : null;
            })()}

            {/* Today's predictions per stock */}
            {today && today.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {today.map((entry) => {
                  if (entry.predictions.length === 0) return null;
                  return (
                    <Card key={entry.ticker}>
                      <div className="mb-3">
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                          {entry.name_ko || entry.name}
                          <span className="ml-2 text-xs font-normal text-slate-400">{entry.ticker} · {entry.market}</span>
                        </h3>
                      </div>
                      <div className="overflow-x-auto -mx-3 sm:-mx-5">
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="text-slate-400 dark:text-slate-500 text-[10px] sm:text-xs uppercase">
                              <th className="px-3 sm:px-4 py-1.5 text-left">{t('intraday.slot')}</th>
                              <th className="px-2 py-1.5 text-left">{t('table.llm')}</th>
                              <th className="px-2 py-1.5 text-center">{t('intraday.direction')}</th>
                              <th className="px-2 py-1.5 text-right">{t('intraday.reference')}</th>
                              <th className="px-2 py-1.5 text-right">{t('intraday.actualPrice')}</th>
                              <th className="px-2 py-1.5 text-right">{t('intraday.change')}</th>
                              <th className="px-3 sm:px-4 py-1.5 text-center">{t('intraday.result')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.predictions.map((pred) => {
                              const idx = llmIndex[pred.llm_id] ?? 0;
                              return (
                                <tr
                                  key={pred.id}
                                  className="border-t border-slate-100 dark:border-[#2c2c2e]"
                                >
                                  <td className="px-3 sm:px-4 py-2 text-left font-mono text-slate-600 dark:text-slate-300">
                                    {pad(pred.prediction_hour)}:{pad(pred.prediction_minute)}&rarr;{pad(pred.target_hour)}:{pad(pred.target_minute)}
                                  </td>
                                  <td className="px-2 py-2 text-left">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold ${LLM_TEXT_COLORS[idx % LLM_TEXT_COLORS.length]} ${LLM_BG_LIGHT[idx % LLM_BG_LIGHT.length]}`}>
                                      {pred.llm_id}
                                    </span>
                                  </td>
                                  <td className={`px-2 py-2 text-center font-bold ${DIR_COLORS[pred.direction] || ''}`}>
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] sm:text-xs ${DIR_BG[pred.direction] || ''}`}>
                                      {pred.direction}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                                    {formatPrice(pred.reference_price)}
                                  </td>
                                  <td className="px-2 py-2 text-right font-mono text-slate-600 dark:text-slate-300">
                                    {pred.actual_price !== null ? formatPrice(pred.actual_price) : <span className="text-slate-400">{t('intraday.pending')}</span>}
                                  </td>
                                  <td className={`px-2 py-2 text-right font-mono ${
                                    pred.actual_change_rate !== null
                                      ? pred.actual_change_rate > 0 ? 'text-emerald-600 dark:text-emerald-400' : pred.actual_change_rate < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                                      : 'text-slate-400'
                                  }`}>
                                    {pred.actual_change_rate !== null
                                      ? `${pred.actual_change_rate >= 0 ? '+' : ''}${pred.actual_change_rate.toFixed(2)}%`
                                      : '-'}
                                  </td>
                                  <td className="px-3 sm:px-4 py-2 text-center">
                                    {pred.is_correct === 1 && (
                                      <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold leading-5">O</span>
                                    )}
                                    {pred.is_correct === 0 && (
                                      <span className="inline-block w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold leading-5">X</span>
                                    )}
                                    {pred.is_correct === null && (
                                      <span className="text-slate-400 text-xs">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title={t('intraday.noData')}
                description={t('intraday.noDataDesc')}
              />
            )}

            {/* Accuracy trend chart */}
            {history && history.length > 1 && (
              <Card>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                    {t('intraday.accuracyTrend')}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('intraday.accuracyTrendDesc')}
                  </p>
                </div>
                <AccuracyLineChart data={history} />
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}
