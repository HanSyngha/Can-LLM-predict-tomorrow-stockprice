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

  const isUp = stock.changeRate != null && stock.changeRate > 0;
  const isDown = stock.changeRate != null && stock.changeRate < 0;

  return (
    <Card hoverable onClick={() => navigate(`/stock/${stock.ticker}`)} className="animate-fade-in !p-0 overflow-hidden group">
      <div className="p-4 sm:p-5">
        {/* Top row: name + price */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-sm sm:text-[15px] text-slate-900 dark:text-white truncate leading-tight">
              {formatStockName(stock)}
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5 font-medium">
              {stock.market} &middot; {stock.ticker}
            </p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="font-bold text-sm sm:text-[15px] text-slate-900 dark:text-white tabular-nums">
              {formatPrice(stock.currentPrice, stock.market)}
            </p>
            <p className={`text-xs font-semibold flex items-center justify-end gap-0.5 mt-0.5 ${changeRateColor(stock.changeRate)}`}>
              {isUp && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              )}
              {isDown && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              )}
              {formatPercent(stock.changeRate)}
            </p>
          </div>
        </div>

        {/* Bottom row: accuracy + prediction */}
        <div className="flex items-end justify-between pt-3 border-t border-slate-100 dark:border-white/[0.04]">
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 font-semibold uppercase tracking-wider mb-0.5">
              {t('stock.accuracy')}
            </p>
            <p className={`text-lg font-black tabular-nums ${stock.accuracy >= 60 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {stock.totalPredictions > 0 ? `${stock.accuracy.toFixed(1)}%` : '-'}
            </p>
          </div>
          <div className="text-right">
            {stock.lastPrediction ? (
              <Badge variant={dirBadgeVariant}>
                {directionLabel(stock.lastPrediction.direction)}
              </Badge>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-600">{t('dashboard.noPredictions')}</span>
            )}
            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">
              {stock.totalPredictions > 0
                ? t('dashboard.predictions', { count: stock.totalPredictions })
                : ''}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
