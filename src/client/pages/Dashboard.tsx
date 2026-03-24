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

const LLM_COLORS = [
  { bar: 'from-blue-500 to-cyan-400', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/20' },
  { bar: 'from-violet-500 to-purple-400', text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10', ring: 'ring-violet-500/20' },
  { bar: 'from-emerald-500 to-teal-400', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
  { bar: 'from-amber-500 to-orange-400', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
  { bar: 'from-rose-500 to-pink-400', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/20' },
];

const STAT_CONFIGS = [
  { key: 'overallAccuracy', icon: '/', gradient: 'from-indigo-500 to-violet-500', iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/20' },
  { key: 'totalPredictions', icon: '#', gradient: 'from-blue-500 to-cyan-500', iconBg: 'bg-blue-500/10 dark:bg-blue-500/20' },
  { key: 'totalCorrect', icon: '+', gradient: 'from-emerald-500 to-teal-500', iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
  { key: 'stockCount', icon: '$', gradient: 'from-amber-500 to-orange-500', iconBg: 'bg-amber-500/10 dark:bg-amber-500/20' },
] as const;

function StatValue({ configKey, summary }: { configKey: string; summary: DashboardSummary | null }) {
  if (!summary) return <span>-</span>;
  switch (configKey) {
    case 'overallAccuracy': return <span>{summary.overallAccuracy.toFixed(1)}%</span>;
    case 'totalPredictions': return <span>{summary.totalPredictions.toLocaleString()}</span>;
    case 'totalCorrect': return <span>{summary.totalCorrect.toLocaleString()}</span>;
    case 'stockCount': return <span>{summary.stockCount}</span>;
    default: return <span>-</span>;
  }
}

export function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const { data: summary, loading: summaryLoading } = useApi<DashboardSummary>(
    () => dashboardApi.getSummary(), []
  );
  const { data: stocks, loading: stocksLoading } = useApi<StockSummary[]>(
    () => stocksApi.getAll(), []
  );
  const { data: history, loading: historyLoading } = useApi<AccuracyHistoryEntry[]>(
    () => dashboardApi.getAccuracyHistory(), []
  );
  const { data: llmComparison } = useApi<LLMComparisonEntry[]>(
    () => dashboardApi.getLLMComparison(), []
  );

  const loading = summaryLoading || stocksLoading;

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 md:pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8 animate-fade-in">
            {/* Page title */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t('dashboard.title')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                {t('dashboard.subtitle')}
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {STAT_CONFIGS.map((stat, idx) => (
                <Card key={stat.key} className="!p-4 sm:!p-5 group relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${stat.gradient}`} />
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                        {t(`dashboard.${stat.key}`)}
                      </p>
                      <p className={`text-xl sm:text-3xl font-black tracking-tight ${
                        stat.key === 'overallAccuracy' && (summary?.overallAccuracy ?? 0) >= 60
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : stat.key === 'totalCorrect'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}>
                        <StatValue configKey={stat.key} summary={summary ?? null} />
                      </p>
                    </div>
                    <div className={`w-9 h-9 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0`}>
                      <span className={`text-sm font-black bg-gradient-to-br ${stat.gradient} bg-clip-text text-transparent`}>
                        {stat.icon}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* LLM Comparison Section */}
            {llmComparison && llmComparison.length > 0 && (
              <Card>
                <div className="mb-5">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    {t('dashboard.llmComparison')}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500 mt-0.5">
                    {t('dashboard.llmComparisonDesc')}
                  </p>
                </div>
                <div className="space-y-3">
                  {llmComparison.map((llm, idx) => {
                    const color = LLM_COLORS[idx % LLM_COLORS.length];
                    const barWidth = Math.max(llm.accuracy, 3);
                    return (
                      <div key={llm.llmId} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${color.bg} ${color.text} ring-1 ${color.ring}`}>
                              {llm.llmName}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-600 hidden sm:inline">{llm.model}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{llm.accuracy.toFixed(1)}%</span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-600">{llm.totalCorrect}/{llm.totalPredictions}</span>
                          </div>
                        </div>
                        <div className="relative h-2 bg-slate-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className={`absolute left-0 top-0 h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-700 ease-out`}
                            style={{ width: `${barWidth}%` }}
                          />
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
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    {t('dashboard.accuracyTrend')}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-500 mt-0.5">
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  {t('dashboard.myStocks')}
                </h2>
                <button
                  onClick={() => navigate('/stock/add')}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  + {t('nav.addStock')}
                </button>
              </div>

              {stocks && stocks.length > 0 ? (
                <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
