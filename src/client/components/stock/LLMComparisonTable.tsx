import React from 'react';
import { Spinner } from '../ui/Spinner';
import { useI18n } from '../../contexts/I18nContext';
import { useApi } from '../../hooks/useApi';
import { predictionsApi, llmsApi } from '../../lib/api';
import type { DatePredictionComparison, LLMConfig } from '../../lib/types';

// Distinct colors for each LLM
const LLM_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
];

interface LLMComparisonTableProps {
  ticker: string;
}

export function LLMComparisonTable({ ticker }: LLMComparisonTableProps) {
  const { t } = useI18n();

  const { data: llmConfigs } = useApi<LLMConfig[]>(
    () => llmsApi.getAll(),
    []
  );

  const { data: comparisonData, loading } = useApi<DatePredictionComparison[]>(
    () => predictionsApi.getAllLLMs(ticker, 30),
    [ticker]
  );

  const activeLLMs = llmConfigs?.filter(c => c.isActive) || [];

  if (loading) {
    return (
      <section className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-slate-200 dark:border-[#38383a] overflow-hidden">
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </section>
    );
  }

  if (!comparisonData || comparisonData.length === 0) {
    return (
      <section className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-slate-200 dark:border-[#38383a] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2c2c2e] bg-slate-50/50 dark:bg-[#2c2c2e]/50">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            {t('detail.llmComparisonTable')}
          </h2>
        </div>
        <div className="py-12 text-center text-slate-400 dark:text-slate-500">
          {t('common.noData')}
        </div>
      </section>
    );
  }

  // Build LLM column list from configs
  const llmColumns = activeLLMs.length > 0
    ? activeLLMs
    : comparisonData.length > 0
      ? [...new Set(comparisonData.flatMap(d => d.predictions.map(p => p.llm_id)))].map(id => ({
          id,
          name: comparisonData[0]!.predictions.find(p => p.llm_id === id)?.llm_name || id,
        }))
      : [];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatActual = (row: DatePredictionComparison) => {
    if (!row.actual_direction) return '-';
    const sign = row.actual_change_rate && row.actual_change_rate >= 0 ? '+' : '';
    const rate = row.actual_change_rate !== null ? `${sign}${row.actual_change_rate.toFixed(1)}%` : '';
    return `${row.actual_direction} ${rate}`;
  };

  const getCellStyle = (isCorrect: number | null): string => {
    if (isCorrect === 1) return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300';
    if (isCorrect === 0) return 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300';
    return 'bg-slate-50 dark:bg-[#2c2c2e] text-slate-500 dark:text-slate-400';
  };

  const getCellContent = (row: DatePredictionComparison, llmId: string): { direction: string; isCorrect: number | null } | null => {
    const pred = row.predictions.find(p => p.llm_id === llmId);
    if (!pred) return null;
    return { direction: pred.direction, isCorrect: pred.is_correct };
  };

  return (
    <section className="bg-white dark:bg-[#1c1c1e] rounded-xl shadow-sm border border-slate-200 dark:border-[#38383a] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-[#2c2c2e] bg-slate-50/50 dark:bg-[#2c2c2e]/50">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">
          {t('detail.llmComparisonTable')}
          <span className="ml-2 text-sm font-normal text-slate-400">({comparisonData.length})</span>
        </h2>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white dark:from-[#1c1c1e] to-transparent z-10 sm:hidden" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-white dark:from-[#1c1c1e] to-transparent z-10 sm:hidden" />
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#2c2c2e] text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-bold">
              <th className="px-3 sm:px-4 py-3 sticky left-0 bg-slate-50 dark:bg-[#2c2c2e] z-20">{t('table.date')}</th>
              <th className="px-3 sm:px-4 py-3">{t('table.actual')}</th>
              {llmColumns.map((llm, i) => (
                <th key={'id' in llm ? llm.id : (llm as { id: string }).id} className="px-3 sm:px-4 py-3 text-center">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: LLM_COLORS[i % LLM_COLORS.length] }}
                  />
                  {'name' in llm ? llm.name : (llm as { name: string }).name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2c2c2e] text-sm">
            {comparisonData.map((row) => (
              <tr key={row.date} className="hover:bg-slate-50 dark:hover:bg-[#2c2c2e]/50 transition-colors">
                <td className="px-3 sm:px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 sticky left-0 bg-white dark:bg-[#1c1c1e] z-20">
                  {formatDate(row.date)}
                </td>
                <td className="px-3 sm:px-4 py-3 text-xs font-bold whitespace-nowrap">
                  <span className={
                    row.actual_direction === 'UP' ? 'text-emerald-600 dark:text-emerald-400'
                    : row.actual_direction === 'DOWN' ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                  }>
                    {formatActual(row)}
                  </span>
                </td>
                {llmColumns.map((llm) => {
                  const llmId = 'id' in llm ? llm.id : (llm as { id: string }).id;
                  const cell = getCellContent(row, llmId);
                  if (!cell) {
                    return (
                      <td key={llmId} className="px-3 sm:px-4 py-3 text-center text-xs text-slate-300 dark:text-slate-600">
                        -
                      </td>
                    );
                  }
                  return (
                    <td key={llmId} className="px-3 sm:px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${getCellStyle(cell.isCorrect)}`}>
                        {cell.direction}
                        {cell.isCorrect === 1 && ' \u2713'}
                        {cell.isCorrect === 0 && ' \u2717'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
