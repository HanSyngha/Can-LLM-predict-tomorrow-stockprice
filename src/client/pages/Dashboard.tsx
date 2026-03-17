import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { AccuracyLineChart } from '../components/charts/AccuracyLineChart';
import { StockCard } from '../components/stock/StockCard';
import { useI18n } from '../contexts/I18nContext';
import { useApi } from '../hooks/useApi';
import { dashboardApi, stocksApi } from '../lib/api';
import type { DashboardSummary, StockSummary, AccuracyHistoryEntry, LLMComparisonEntry } from '../lib/types';

// Color palette for LLM comparison bars - gradient fills for macOS-like polish
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

export function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const { data: summary, loading: summaryLoading } = useApi<DashboardSummary>(
    () => dashboardApi.getSummary(),
    []
  );
  const { data: stocks, loading: stocksLoading } = useApi<StockSummary[]>(
    () => stocksApi.getAll(),
    []
  );
  const { data: history, loading: historyLoading } = useApi<AccuracyHistoryEntry[]>(
    () => dashboardApi.getAccuracyHistory(),
    []
  );
  const { data: llmComparison } = useApi<LLMComparisonEntry[]>(
    () => dashboardApi.getLLMComparison(),
    []
  );

  const loading = summaryLoading || stocksLoading;

  return (
    <>
      <Header title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Stats row */}
            <div className="grid grid-cols-1 min-[320px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card className="p-3 sm:p-6 border-t-2 border-t-indigo-500">
                <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('dashboard.overallAccuracy')}
                </p>
                <p className={`text-2xl sm:text-3xl font-black mt-1 ${
                  (summary?.overallAccuracy ?? 0) >= 60
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-800 dark:text-white'
                }`}>
                  {summary ? `${summary.overallAccuracy.toFixed(1)}%` : '-'}
                </p>
              </Card>
              <Card className="p-3 sm:p-6 border-t-2 border-t-blue-500">
                <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('dashboard.totalPredictions')}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white mt-1">
                  {summary?.totalPredictions ?? 0}
                </p>
              </Card>
              <Card className="p-3 sm:p-6 border-t-2 border-t-emerald-500">
                <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('dashboard.totalCorrect')}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {summary?.totalCorrect ?? 0}
                </p>
              </Card>
              <Card className="p-3 sm:p-6 border-t-2 border-t-amber-500">
                <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                  {t('dashboard.stockCount')}
                </p>
                <p className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white mt-1">
                  {summary?.stockCount ?? 0}
                </p>
              </Card>
            </div>

            {/* LLM Comparison Section */}
            {llmComparison && llmComparison.length > 0 && (
              <Card>
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                    {t('dashboard.llmComparison')}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('dashboard.llmComparisonDesc')}
                  </p>
                </div>
                <div className="space-y-4">
                  {llmComparison.map((llm, idx) => {
                    const gradientClass = LLM_GRADIENTS[idx % LLM_GRADIENTS.length];
                    const textColorClass = LLM_TEXT_COLORS[idx % LLM_TEXT_COLORS.length];
                    const barWidth = Math.max(llm.accuracy, 2); // minimum visible bar
                    return (
                      <div key={llm.llmId} className="flex items-center gap-4">
                        <div className="w-28 shrink-0 text-right">
                          <p className={`text-sm font-bold ${textColorClass}`}>{llm.llmName}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{llm.model}</p>
                        </div>
                        <div className="flex-1">
                          <div className="relative h-8 bg-slate-100 dark:bg-[#2c2c2e] rounded-full overflow-hidden">
                            <div
                              className={`absolute left-0 top-0 h-full ${gradientClass} rounded-full transition-all duration-500 ease-out`}
                              style={{ width: `${barWidth}%` }}
                            />
                            <div className="absolute inset-0 flex items-center px-3">
                              <span className="text-xs font-bold text-white drop-shadow-sm">
                                {llm.accuracy.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="w-24 shrink-0 text-right">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {llm.totalCorrect}/{llm.totalPredictions}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Accuracy trend chart */}
            {history && history.length > 1 && (
              <Card>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                    {t('dashboard.accuracyTrend')}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('dashboard.accuracyTrendDesc')}
                  </p>
                </div>
                {historyLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : (
                  <AccuracyLineChart data={history} />
                )}
              </Card>
            )}

            {/* Stock cards */}
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
                {t('dashboard.myStocks')}
              </h2>

              {stocks && stocks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stocks.map((stock) => (
                    <StockCard key={stock.ticker} stock={stock} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t('dashboard.emptyTitle')}
                  description={t('dashboard.emptyDescription')}
                  actionLabel={t('dashboard.emptyAction')}
                  onAction={() => navigate('/stock/add')}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
