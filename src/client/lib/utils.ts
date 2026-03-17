import type { Direction, Market } from './types';

/**
 * Format stock name based on market.
 * KOSPI/KOSDAQ: 한글명(영문명) if name_ko is available, otherwise just English name
 * Other markets: English name only
 */
export function formatStockName(stock: { name: string; name_ko?: string | null; ticker: string; market: string }): string {
  const isKorean = stock.market === 'KOSPI' || stock.market === 'KOSDAQ';
  if (isKorean && stock.name_ko) {
    return `${stock.name_ko}(${stock.name})`;
  }
  return stock.name;
}

export function formatStockNameWithTicker(stock: { name: string; name_ko?: string | null; ticker: string; market: string }): string {
  return `${formatStockName(stock)} [${stock.ticker}]`;
}

/**
 * Format price based on market.
 * KRW markets (KOSPI, KOSDAQ): no decimals, comma separated (e.g. 72,300)
 * USD markets: 2 decimals with $ prefix (e.g. $184.15)
 */
export function formatPrice(price: number | null | undefined, market: Market): string {
  if (price == null) return '-';

  const isKRW = market === 'KOSPI' || market === 'KOSDAQ';

  if (isKRW) {
    return price.toLocaleString('ko-KR', {
      maximumFractionDigits: 0,
    });
  }

  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format percent with sign (e.g. +1.45%, -0.82%)
 */
export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '-';
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

/**
 * Format date string to locale-appropriate display
 */
export function formatDate(dateStr: string | null | undefined, locale: string = 'ko'): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    if (locale === 'ko') {
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get text color class for a direction
 */
export function directionColor(direction: Direction | null | undefined): string {
  switch (direction) {
    case 'UP':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'DOWN':
      return 'text-rose-600 dark:text-rose-400';
    case 'FLAT':
      return 'text-slate-500 dark:text-slate-400';
    case 'UNABLE':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-slate-400 dark:text-slate-500';
  }
}

/**
 * Get display label for direction
 */
export function directionLabel(direction: Direction | null | undefined): string {
  switch (direction) {
    case 'UP':
      return 'BULLISH';
    case 'DOWN':
      return 'BEARISH';
    case 'FLAT':
      return 'FLAT';
    case 'UNABLE':
      return 'UNABLE';
    default:
      return '-';
  }
}

/**
 * Get badge color class for correctness
 */
export function correctnessColor(isCorrect: number | null | undefined): string {
  if (isCorrect === 1) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (isCorrect === 0) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
  return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400';
}

/**
 * Get change rate color
 */
export function changeRateColor(rate: number | null | undefined): string {
  if (rate == null) return 'text-slate-400';
  if (rate > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (rate < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-slate-500 dark:text-slate-400';
}
