import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { useI18n } from '../contexts/I18nContext';
import { dashboardApi } from '../lib/api';
import type { SchedulerStatus } from '../lib/types';

const PHASE_STYLES: Record<string, { bg: string; text: string; label_ko: string; label_en: string }> = {
  idle: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', label_ko: '대기', label_en: 'Idle' },
  predicting: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', label_ko: '예측 중', label_en: 'Predicting' },
  reviewing: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', label_ko: '리뷰 중', label_en: 'Reviewing' },
};

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  success: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  failed: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  running: { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-600 dark:text-blue-400' },
  pending: { dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-400 dark:text-slate-500' },
};

export function Admin() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await dashboardApi.getStatus();
      setStatus(data);
    } catch {
      // ignore fetch errors
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const isActive = status?.phase !== 'idle';
  const phaseStyle = PHASE_STYLES[status?.phase ?? 'idle'] ?? PHASE_STYLES.idle;
  const progressPercent = status?.progress.total
    ? Math.round((status.progress.completed / status.progress.total) * 100)
    : 0;

  // Group results by ticker
  const groupedResults = status?.results.reduce<Record<string, typeof status.results>>((acc, r) => {
    if (!acc[r.ticker]) acc[r.ticker] = [];
    acc[r.ticker]!.push(r);
    return acc;
  }, {}) ?? {};

  const statusCounts = {
    success: status?.results.filter(r => r.status === 'success').length ?? 0,
    failed: status?.results.filter(r => r.status === 'failed').length ?? 0,
    running: status?.results.filter(r => r.status === 'running').length ?? 0,
    pending: status?.results.filter(r => r.status === 'pending').length ?? 0,
  };

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 md:pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('admin.title')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">{t('admin.subtitle')}</p>
            </div>
            {/* Phase indicator */}
            <Card className="!p-0 overflow-hidden">
              <div className={`p-4 sm:p-6 ${phaseStyle.bg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
                    <div>
                      <h2 className={`text-lg sm:text-xl font-black ${phaseStyle.text}`}>
                        {locale === 'ko' ? phaseStyle.label_ko : phaseStyle.label_en}
                      </h2>
                      {status?.startedAt && isActive && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {t('admin.startedAt')}: {new Date(status.startedAt).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Auto-refresh indicator */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('admin.autoRefresh')}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {isActive && status?.progress?.total && status.progress.total > 0 && (
                <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-[#2c2c2e]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {t('admin.progress')}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {status!.progress!.completed} / {status!.progress!.total} ({progressPercent}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-[#2c2c2e] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* Summary counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3 sm:p-4 border-l-4 border-l-blue-500">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{t('admin.running')}</p>
                <p className="text-xl font-black text-blue-600 dark:text-blue-400">{statusCounts.running}</p>
              </Card>
              <Card className="p-3 sm:p-4 border-l-4 border-l-slate-300">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{t('admin.pending')}</p>
                <p className="text-xl font-black text-slate-500 dark:text-slate-400">{statusCounts.pending}</p>
              </Card>
              <Card className="p-3 sm:p-4 border-l-4 border-l-emerald-500">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{t('admin.success')}</p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{statusCounts.success}</p>
              </Card>
              <Card className="p-3 sm:p-4 border-l-4 border-l-rose-500">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{t('admin.failed')}</p>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400">{statusCounts.failed}</p>
              </Card>
            </div>

            {/* LLM Average Duration */}
            {status?.llmAvgDurations && Object.keys(status.llmAvgDurations).length > 0 && (
              <Card>
                <h2 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-white mb-3">
                  {t('admin.avgDuration')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {Object.entries(status.llmAvgDurations).map(([llmId, d]) => {
                    const avgSec = Math.round(d.avgMs / 1000);
                    const min = Math.floor(avgSec / 60);
                    const sec = avgSec % 60;
                    return (
                      <div key={llmId} className="bg-slate-50 dark:bg-[#2c2c2e] rounded-lg p-2.5 text-center">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate">{llmId}</p>
                        <p className="text-base sm:text-lg font-black text-slate-800 dark:text-white">
                          {min > 0 ? `${min}m ${sec}s` : `${sec}s`}
                        </p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500">{d.count} {t('admin.predictions')}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Results by stock */}
            {Object.keys(groupedResults).length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                  {t('admin.stockStatus')}
                </h2>
                {Object.entries(groupedResults).map(([ticker, results]) => (
                  <Card key={ticker} className="!p-0 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-[#1c1c1e] border-b border-slate-100 dark:border-[#2c2c2e]">
                      <span className="font-bold text-slate-800 dark:text-white">{ticker}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-[#2c2c2e]">
                      {results.map((r) => {
                        const style = STATUS_STYLES[r.status] ?? STATUS_STYLES.pending;
                        return (
                          <div key={`${r.ticker}-${r.llmId}`} className="px-4 py-2.5 flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {r.llmId}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {r.direction && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  r.direction === 'UP' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                                  r.direction === 'DOWN' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' :
                                  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}>
                                  {r.direction}
                                </span>
                              )}
                              <span className={`text-[10px] sm:text-xs font-bold ${style.text}`}>
                                {r.status === 'running'
                                  ? `${t('admin.statusRunning')}${r.searchIteration ? ` (${r.searchIteration}/50)` : ''}`
                                  : r.status === 'pending' ? t('admin.statusPending')
                                  : r.status === 'success' ? t('admin.statusSuccess')
                                  : t('admin.statusFailed')}
                              </span>
                              {r.durationMs != null && (
                                <span className="text-[9px] text-slate-400 dark:text-slate-500">
                                  {Math.round(r.durationMs / 1000)}s
                                </span>
                              )}
                            </div>
                            {r.error && (
                              <span className="text-[10px] text-rose-500 truncate max-w-[200px]" title={r.error}>
                                {r.error}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="py-12 text-center">
                <p className="text-slate-400 dark:text-slate-500 text-sm">
                  {t('admin.noActivity')}
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}
