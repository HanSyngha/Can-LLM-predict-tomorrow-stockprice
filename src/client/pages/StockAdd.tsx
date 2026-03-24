import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n } from '../contexts/I18nContext';
import { stocksApi } from '../lib/api';
import { formatStockName } from '../lib/utils';
import type { StockSearchResult } from '../lib/types';

export function StockAdd() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingTicker, setAddingTicker] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [koreanNameInput, setKoreanNameInput] = useState<Record<string, string>>({});
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isKoreanMarket = (market: string) => market === 'KOSPI' || market === 'KOSDAQ';

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const res = await stocksApi.search(q.trim());
      setResults(res);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleAddClick = (result: StockSearchResult) => {
    if (isKoreanMarket(result.market)) {
      // Show Korean name input for Korean stocks
      setPendingAdd(result.ticker);
      // Pre-fill with name_ko from search result if available
      if (result.name_ko && !koreanNameInput[result.ticker]) {
        setKoreanNameInput(prev => ({ ...prev, [result.ticker]: result.name_ko || '' }));
      }
    } else {
      handleAdd(result);
    }
  };

  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());

  const handleConfirmAdd = async (result: StockSearchResult) => {
    const nameKo = koreanNameInput[result.ticker]?.trim() || null;
    setAddingTicker(result.ticker);
    setMessage(null);
    try {
      await stocksApi.add({
        ticker: result.ticker,
        name: result.name,
        market: result.market,
        name_ko: nameKo ?? undefined,
      });
      const displayName = nameKo ? `${nameKo}(${result.name})` : result.name;
      setMessage({ type: 'success', text: t('addStock.addSuccess', { name: displayName }) });
      setAddedTickers(prev => new Set(prev).add(result.ticker));
    } catch (err: unknown) {
      const errorBody = (err as { body?: { error?: string } })?.body;
      const msg = errorBody?.error;
      if (msg?.includes('already') || msg?.includes('UNIQUE')) {
        setMessage({ type: 'error', text: t('addStock.alreadyExists') });
      } else {
        setMessage({ type: 'error', text: t('addStock.addFailed') });
      }
    }
    setAddingTicker(null);
    setPendingAdd(null);
  };

  const handleAdd = async (result: StockSearchResult) => {
    setAddingTicker(result.ticker);
    setMessage(null);
    try {
      await stocksApi.add({
        ticker: result.ticker,
        name: result.name,
        market: result.market,
      });
      setMessage({ type: 'success', text: t('addStock.addSuccess', { name: result.name }) });
      setAddedTickers(prev => new Set(prev).add(result.ticker));
    } catch (err: unknown) {
      const errorBody = (err as { body?: { error?: string } })?.body;
      const msg = errorBody?.error;
      if (msg?.includes('already') || msg?.includes('UNIQUE')) {
        setMessage({ type: 'error', text: t('addStock.alreadyExists') });
      } else {
        setMessage({ type: 'error', text: t('addStock.addFailed') });
      }
    }
    setAddingTicker(null);
  };

  return (
    <>
      <Header />
      <main className="w-full px-5 sm:px-8 lg:px-10 py-6 sm:py-8 pb-20 md:pb-8">
        <div className="space-y-6 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('addStock.title')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">{t('addStock.subtitle')}</p>
          </div>
          {/* Search */}
          <Card>
            <Input
              label={t('common.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('addStock.searchPlaceholder')}
              hint={t('addStock.searchHint')}
            />
          </Card>

          {/* Message */}
          {message && (
            <div
              className={`p-4 rounded-xl text-sm font-medium ${
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Results */}
          {searching && (
            <div className="flex items-center justify-center py-8">
              <Spinner />
              <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">{t('addStock.searching')}</span>
            </div>
          )}

          {!searching && query.trim().length > 0 && results.length === 0 && (
            <EmptyState
              title={t('addStock.noResults')}
              description={t('addStock.noResultsDesc')}
            />
          )}

          {!searching && results.length > 0 && (
            <div className="space-y-2">
              {results.map((result) => (
                <Card
                  key={result.ticker}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col min-[360px]:flex-row min-[360px]:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        {formatStockName({ ...result, ticker: result.ticker, market: result.market })}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {result.market}: {result.ticker}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddClick(result)}
                      loading={addingTicker === result.ticker}
                      disabled={addingTicker !== null || addedTickers.has(result.ticker)}
                      className="shrink-0 w-full min-[360px]:w-auto"
                    >
                      {addedTickers.has(result.ticker) ? '✓' : t('addStock.addButton')}
                    </Button>
                  </div>
                  {/* Korean name input for KOSPI/KOSDAQ */}
                  {pendingAdd === result.ticker && isKoreanMarket(result.market) && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pt-2 border-t border-slate-100 dark:border-[#2c2c2e]">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                          {t('addStock.koreanNameLabel')}
                        </label>
                        <input
                          type="text"
                          value={koreanNameInput[result.ticker] || ''}
                          onChange={(e) => setKoreanNameInput(prev => ({ ...prev, [result.ticker]: e.target.value }))}
                          placeholder={t('addStock.koreanNamePlaceholder')}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#38383a] bg-white dark:bg-[#2c2c2e] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-200"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPendingAdd(null)}
                          className="shrink-0"
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleConfirmAdd(result)}
                          loading={addingTicker === result.ticker}
                          className="shrink-0"
                        >
                          {t('common.confirm')}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
