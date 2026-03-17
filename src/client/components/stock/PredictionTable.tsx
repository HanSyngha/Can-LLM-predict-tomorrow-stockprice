import React, { useState, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { PredictionRow } from './PredictionRow';
import { PredictionDetail } from './PredictionDetail';
import { useI18n } from '../../contexts/I18nContext';
import { predictionsApi } from '../../lib/api';
import type { Prediction, Market, PaginatedResponse } from '../../lib/types';

interface PredictionTableProps {
  ticker: string;
  market: Market;
  llmId?: string;
}

const PAGE_SIZE = 20;

export function PredictionTable({ ticker, market, llmId }: PredictionTableProps) {
  const { t } = useI18n();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [total, setTotal] = useState(0);

  // Initial load (re-fetch when llmId changes)
  React.useEffect(() => {
    setLoading(true);
    setPredictions([]);
    predictionsApi
      .getByTicker(ticker, PAGE_SIZE, 0, llmId)
      .then((res: PaginatedResponse<Prediction>) => {
        setPredictions(res.items);
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker, llmId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await predictionsApi.getByTicker(ticker, PAGE_SIZE, predictions.length, llmId);
      setPredictions((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
      setTotal(res.total);
    } catch {}
    setLoadingMore(false);
  }, [ticker, predictions.length, llmId]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exportCSV = useCallback(() => {
    const headers = ['Date', 'Prediction', 'Actual', 'Change %', 'Close', 'Correct'];
    const rows = predictions.map((p) => [
      p.prediction_date,
      p.direction,
      p.actual_direction || '',
      p.actual_change_rate != null ? p.actual_change_rate.toFixed(2) : '',
      p.actual_close_price != null ? String(p.actual_close_price) : '',
      p.is_correct != null ? (p.is_correct === 1 ? 'YES' : 'NO') : '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}_predictions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [predictions, ticker]);

  if (loading) {
    return (
      <Card padding={false}>
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <section className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-slate-200 dark:border-[#38383a] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2c2c2e] bg-slate-50/50 dark:bg-[#2c2c2e]/50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          {t('detail.predictionHistory')}
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">({total})</span>
          )}
        </h2>
        <Button variant="secondary" size="sm" onClick={exportCSV}>
          {t('detail.exportCSV')}
        </Button>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto">
        {/* Scroll shadow indicators */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white dark:from-[#1c1c1e] to-transparent z-10 sm:hidden" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white dark:from-[#1c1c1e] to-transparent z-10 sm:hidden" />
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#2c2c2e] text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">
              <th className="px-3 sm:px-6 py-4">{t('table.date')}</th>
              <th className="px-3 sm:px-6 py-4">{t('table.prediction')}</th>
              <th className="px-3 sm:px-6 py-4">{t('table.actual')}</th>
              <th className="px-3 sm:px-6 py-4">{t('table.changePercent')}</th>
              <th className="px-3 sm:px-6 py-4">{t('table.close')}</th>
              <th className="px-3 sm:px-6 py-4 text-center">{t('table.correct')}</th>
              <th className="px-3 sm:px-6 py-4">{t('table.insight')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2c2c2e] text-sm">
            {predictions.map((pred) => (
              <React.Fragment key={pred.id}>
                <PredictionRow
                  prediction={pred}
                  market={market}
                  isExpanded={expandedIds.has(pred.id)}
                  onToggle={() => toggleExpand(pred.id)}
                />
                {expandedIds.has(pred.id) && <PredictionDetail prediction={pred} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {predictions.length === 0 && (
        <div className="py-12 text-center text-slate-400 dark:text-slate-500">
          {t('common.noData')}
        </div>
      )}

      {/* Load more */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-[#2c2c2e]/50 border-t border-slate-100 dark:border-[#2c2c2e] flex justify-center">
        {hasMore ? (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loadingMore && <Spinner size="sm" />}
            {t('detail.loadMore')}
          </button>
        ) : predictions.length > 0 ? (
          <span className="text-sm text-slate-400 dark:text-slate-500">
            {t('detail.noMoreData')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
