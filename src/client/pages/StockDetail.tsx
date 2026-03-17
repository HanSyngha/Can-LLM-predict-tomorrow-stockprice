import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { PriceChart } from '../components/charts/PriceChart';
import { WinRateChart } from '../components/charts/WinRateChart';
import { PredictionTable } from '../components/stock/PredictionTable';
import { LLMComparisonTable } from '../components/stock/LLMComparisonTable';
// NoteViewer removed - notes are now on dedicated /notes page
import { useI18n } from '../contexts/I18nContext';
import { useApi } from '../hooks/useApi';
import { stocksApi, predictionsApi, llmsApi } from '../lib/api';
import { formatStockName } from '../lib/utils';
import type {
  Stock,
  StockPrice,
  Prediction,
  AccuracyHistoryEntry,
  PaginatedResponse,
  LLMConfig,
  DatePredictionComparison,
} from '../lib/types';

// LLM colors matching the comparison table
const LLM_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
];

export function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { t } = useI18n();
  const [selectedLLM, setSelectedLLM] = useState<string | undefined>(undefined);

  const isAllLLMs = !selectedLLM;

  const { data: stock, loading: stockLoading } = useApi<Stock>(
    () => stocksApi.getByTicker(ticker!),
    [ticker]
  );

  const { data: prices } = useApi<StockPrice[]>(
    () => stocksApi.getPrices(ticker!, 30),
    [ticker]
  );

  const { data: accuracyHistory } = useApi<AccuracyHistoryEntry[]>(
    () => stocksApi.getAccuracyHistory(ticker!),
    [ticker]
  );

  const { data: recentPredictions } = useApi<PaginatedResponse<Prediction>>(
    () => predictionsApi.getByTicker(ticker!, 30, 0, selectedLLM),
    [ticker, selectedLLM]
  );

  // Fetch all-LLMs data when "All LLMs" tab is selected
  const { data: allLLMsData } = useApi<DatePredictionComparison[]>(
    () => isAllLLMs ? predictionsApi.getAllLLMs(ticker!, 30) : Promise.resolve([]),
    [ticker, isAllLLMs]
  );

  const { data: llmConfigs } = useApi<LLMConfig[]>(
    () => llmsApi.getAll(),
    []
  );

  if (stockLoading) {
    return (
      <>
        <Header showBack />
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      </>
    );
  }

  if (!stock) {
    return (
      <>
        <Header showBack title={t('common.error')} />
        <div className="flex items-center justify-center py-24 text-slate-500">
          Stock not found
        </div>
      </>
    );
  }

  // Calculate stats from accuracy history
  const latestAccuracy = accuracyHistory && accuracyHistory.length > 0
    ? accuracyHistory[accuracyHistory.length - 1]
    : null;

  const winRate = latestAccuracy ? latestAccuracy.accuracy_rate : 0;
  const totalPreds = latestAccuracy ? latestAccuracy.total_predictions : 0;

  // Compute improvement
  let improvement: number | null = null;
  if (accuracyHistory && accuracyHistory.length >= 2) {
    const current = accuracyHistory[accuracyHistory.length - 1].accuracy_rate;
    const monthAgo = accuracyHistory.length > 30 ? accuracyHistory[accuracyHistory.length - 31] : accuracyHistory[0];
    improvement = current - monthAgo.accuracy_rate;
  }

  // Build multi-LLM prediction markers for the chart when in "All LLMs" mode
  const activeLLMs = llmConfigs?.filter(c => c.isActive) || [];
  const llmPredictions = isAllLLMs && allLLMsData
    ? allLLMsData.flatMap(d =>
        d.predictions.map(p => ({
          date: d.date,
          llm_id: p.llm_id,
          direction: p.direction,
          is_correct: p.is_correct,
        }))
      )
    : undefined;

  // Build a color map for LLMs
  const llmColorMap: Record<string, string> = {};
  activeLLMs.forEach((llm, i) => {
    llmColorMap[llm.id] = LLM_COLORS[i % LLM_COLORS.length]!;
  });

  return (
    <>
      {/* Header */}
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-2xl border-b border-slate-200 dark:border-[#38383a] shadow-[0_1px_3px_rgba(0,0,0,0.05)] sticky top-0 z-50 pt-safe">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link
              to="/"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors shrink-0"
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              </svg>
            </Link>
            <div className="flex flex-col min-w-0">
              <h1 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">
                {formatStockName(stock)}
              </h1>
              <span className="text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                {stock.market}: {stock.ticker}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-8 shrink-0">
            <div className="text-right">
              <p className="text-[9px] sm:text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                {t('detail.cumulativeWinRate')}
              </p>
              <p className={`text-base sm:text-2xl font-black ${winRate >= 60 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                {winRate.toFixed(1)}%
              </p>
            </div>
            <div className="text-right border-l pl-3 sm:pl-8 border-slate-200 dark:border-[#38383a] hidden sm:block">
              <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                {t('detail.totalPredictions')}
              </p>
              <p className="text-2xl font-black text-slate-800 dark:text-white">{totalPreds}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-8">
        <div className="space-y-3 sm:space-y-8 animate-fade-in">
          {/* LLM selector tabs */}
          {llmConfigs && llmConfigs.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
              <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 shrink-0">
                {t('detail.llmFilter')}:
              </span>
              <button
                onClick={() => setSelectedLLM(undefined)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all shrink-0 ${
                  !selectedLLM
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                    : 'bg-slate-100 dark:bg-[#2c2c2e] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#3a3a3c]'
                }`}
              >
                {t('detail.allLLMs')}
              </button>
              {llmConfigs.filter(c => c.isActive).map((config) => (
                <button
                  key={config.id}
                  onClick={() => setSelectedLLM(config.id)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all shrink-0 ${
                    selectedLLM === config.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                      : 'bg-slate-100 dark:bg-[#2c2c2e] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#3a3a3c]'
                  }`}
                >
                  {config.name}
                </button>
              ))}
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
            {/* Price & Prediction Chart */}
            <Card className="lg:col-span-2">
              <div className="flex justify-between items-center mb-3 sm:mb-6">
                <h2 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white flex items-center gap-1 sm:gap-2">
                  {t('detail.priceAndPredictions')}
                  <span className="text-[10px] sm:text-xs font-normal text-slate-400 dark:text-slate-500">
                    ({t('detail.last30Days')})
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2 sm:gap-4 text-[10px] sm:text-xs font-medium">
                  {isAllLLMs && activeLLMs.length > 0 ? (
                    activeLLMs.map((llm, i) => (
                      <span key={llm.id} className="flex items-center gap-1">
                        <span
                          className="w-2 h-2 sm:w-3 sm:h-3 rounded-full shrink-0"
                          style={{ backgroundColor: LLM_COLORS[i % LLM_COLORS.length] }}
                        />
                        <span className="text-slate-600 dark:text-slate-400">{llm.name}</span>
                      </span>
                    ))
                  ) : (
                    <>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-slate-600 dark:text-slate-400">{t('detail.chartLegendCorrect')}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-rose-500" />
                        <span className="text-slate-600 dark:text-slate-400">{t('detail.chartLegendIncorrect')}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
              {prices && recentPredictions ? (
                <PriceChart
                  prices={prices}
                  predictions={recentPredictions.items}
                  llmPredictions={llmPredictions}
                  llmColorMap={isAllLLMs ? llmColorMap : undefined}
                />
              ) : (
                <div className="flex items-center justify-center h-[250px] sm:h-[300px] lg:h-[400px]">
                  <Spinner />
                </div>
              )}
            </Card>

            {/* Win Rate Evolution */}
            <Card>
              <h2 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white mb-3 sm:mb-6">
                {t('detail.winRateEvolution')}
              </h2>
              {accuracyHistory && accuracyHistory.length > 0 ? (
                <>
                  <WinRateChart data={accuracyHistory} />
                  {improvement !== null && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-[#2c2c2e]">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className={`font-bold ${improvement >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}%
                        </span>{' '}
                        {t('detail.accuracyImprovement')}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-[200px] sm:h-[250px] lg:h-[300px] text-slate-400 dark:text-slate-500">
                  {t('common.noData')}
                </div>
              )}
            </Card>
          </div>

          {/* Prediction History: Comparison table when "All LLMs", single-LLM table otherwise */}
          {isAllLLMs && llmConfigs && llmConfigs.length > 1 ? (
            <LLMComparisonTable ticker={ticker!} />
          ) : (
            <PredictionTable ticker={ticker!} market={stock.market} llmId={selectedLLM} />
          )}

        </div>
      </main>
    </>
  );
}
