import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useI18n } from '../../contexts/I18nContext';
import type { StockSummary } from '../../lib/types';
import { formatPrice, formatPercent, directionLabel, changeRateColor, formatStockName } from '../../lib/utils';

interface StockCardProps {
  stock: StockSummary;
}

export function StockCard({ stock }: StockCardProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const dirBadgeVariant = stock.lastPrediction?.direction === 'UP'
    ? 'up' as const
    : stock.lastPrediction?.direction === 'DOWN'
    ? 'down' as const
    : 'flat' as const;

  const borderColor = stock.changeRate != null && stock.changeRate > 0
    ? 'border-l-emerald-500 dark:border-l-emerald-400'
    : stock.changeRate != null && stock.changeRate < 0
    ? 'border-l-rose-500 dark:border-l-rose-400'
    : 'border-l-slate-300 dark:border-l-slate-600';

  const gradientBorder = stock.changeRate != null && stock.changeRate > 0
    ? 'from-emerald-500 to-emerald-400'
    : stock.changeRate != null && stock.changeRate < 0
    ? 'from-rose-500 to-rose-400'
    : 'from-slate-400 to-slate-300 dark:from-slate-600 dark:to-slate-500';

  return (
    <Card hoverable onClick={() => navigate(`/stock/${stock.ticker}`)} className="animate-fade-in p-0 overflow-hidden relative group">
      {/* Gradient left border */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${gradientBorder}`} />
      <div className="p-4 sm:p-6 pl-5 sm:pl-7">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white truncate">{formatStockName(stock)}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {stock.market}: {stock.ticker}
            </p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="font-bold text-slate-900 dark:text-white">
              {formatPrice(stock.currentPrice, stock.market)}
            </p>
            <p className={`text-sm font-semibold flex items-center justify-end gap-1 ${changeRateColor(stock.changeRate)}`}>
              {stock.changeRate != null && stock.changeRate > 0 && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              )}
              {stock.changeRate != null && stock.changeRate < 0 && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              )}
              {formatPercent(stock.changeRate)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#38383a]">
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
              {t('stock.accuracy')}
            </p>
            <p className={`text-lg font-black ${stock.accuracy >= 60 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
              {stock.totalPredictions > 0 ? `${stock.accuracy.toFixed(1)}%` : '-'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">
              {t('dashboard.lastPrediction')}
            </p>
            {stock.lastPrediction ? (
              <Badge variant={dirBadgeVariant}>
                {directionLabel(stock.lastPrediction.direction)}
              </Badge>
            ) : (
              <span className="text-xs text-slate-400">{t('dashboard.noPredictions')}</span>
            )}
          </div>
        </div>

        <div className="mt-2">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {stock.totalPredictions > 0
              ? t('dashboard.predictions', { count: stock.totalPredictions })
              : t('dashboard.noPredictions')}
          </p>
        </div>
      </div>
    </Card>
  );
}
