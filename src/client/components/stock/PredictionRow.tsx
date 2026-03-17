import React from 'react';
import { useI18n } from '../../contexts/I18nContext';
import type { Prediction, Market } from '../../lib/types';
import { formatDate, formatPrice, formatPercent, directionLabel, directionColor, correctnessColor, changeRateColor } from '../../lib/utils';

interface PredictionRowProps {
  prediction: Prediction;
  market: Market;
  isExpanded: boolean;
  onToggle: () => void;
}

export function PredictionRow({ prediction, market, isExpanded, onToggle }: PredictionRowProps) {
  const { t, locale } = useI18n();

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-[#2c2c2e] transition-colors">
      <td className="px-2 sm:px-6 py-2.5 sm:py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
        {formatDate(prediction.prediction_date, locale)}
      </td>
      <td className={`px-2 sm:px-6 py-2.5 sm:py-4 font-semibold ${directionColor(prediction.direction)}`}>
        {directionLabel(prediction.direction)}
      </td>
      <td className={`px-2 sm:px-6 py-2.5 sm:py-4 font-semibold ${directionColor(prediction.actual_direction)}`}>
        {prediction.actual_direction ? directionLabel(prediction.actual_direction) : (
          <span className="text-slate-400 dark:text-slate-500 font-normal">{t('prediction.pending')}</span>
        )}
      </td>
      <td className={`px-2 sm:px-6 py-2.5 sm:py-4 ${changeRateColor(prediction.actual_change_rate)}`}>
        {formatPercent(prediction.actual_change_rate)}
      </td>
      <td className="px-2 sm:px-6 py-2.5 sm:py-4 text-slate-700 dark:text-slate-300">
        {formatPrice(prediction.actual_close_price, market)}
      </td>
      <td className="px-2 sm:px-6 py-2.5 sm:py-4 text-center">
        {prediction.is_correct != null ? (
          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${correctnessColor(prediction.is_correct)}`}>
            {prediction.is_correct === 1 ? t('prediction.correctYes') : t('prediction.correctNo')}
          </span>
        ) : (
          <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">-</span>
        )}
      </td>
      <td className="px-2 sm:px-6 py-2.5 sm:py-4">
        {(prediction.reasoning || prediction.search_reports) ? (
          <button
            onClick={onToggle}
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium text-[10px] sm:text-sm"
          >
            {isExpanded ? t('prediction.hideReasoning') : t('prediction.viewReasoning')}
          </button>
        ) : (
          <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">-</span>
        )}
      </td>
    </tr>
  );
}
