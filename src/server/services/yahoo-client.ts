/**
 * Yahoo Finance client using direct HTTP calls.
 * yahoo-finance2 npm package is unreliable (API changes frequently),
 * so we call Yahoo Finance endpoints directly via axios.
 */

import axios from 'axios';
import type { NewStockPrice, TickerSearchResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const YAHOO_SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search';

// Common headers to mimic browser request
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * Search for ticker by company name or symbol.
 */
export async function searchTicker(query: string): Promise<TickerSearchResult[]> {
  try {
    const { data } = await axios.get(YAHOO_SEARCH, {
      params: {
        q: query,
        quotesCount: 10,
        newsCount: 0,
        enableFuzzyQuery: true,
        quotesQueryId: 'tss_match_phrase_query',
      },
      headers: HEADERS,
      timeout: 10000,
    });

    return (data.quotes || [])
      .filter((q: Record<string, unknown>) => q.quoteType === 'EQUITY')
      .slice(0, 10)
      .map((q: Record<string, unknown>) => ({
        ticker: (q.symbol as string) || '',
        name: (q.shortname as string) || (q.longname as string) || '',
        market: mapExchange(q.exchange as string),
        apiSource: 'YAHOO' as const,
      }));
  } catch (error) {
    logger.error('Yahoo Finance search failed', error);
    return [];
  }
}

/**
 * Get real-time quote for a ticker.
 */
export async function getQuote(
  ticker: string
): Promise<{ price: number; changeRate: number } | null> {
  try {
    const { data } = await axios.get(
      `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}`,
      {
        params: {
          interval: '1d',
          range: '1d',
        },
        headers: HEADERS,
        timeout: 10000,
      }
    );

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;

    if (!price) return null;

    const changeRate = prevClose
      ? ((price - prevClose) / prevClose) * 100
      : 0;

    return {
      price,
      changeRate: Math.round(changeRate * 100) / 100,
    };
  } catch (error) {
    logger.error(`Yahoo Finance quote failed for ${ticker}`, error);
    return null;
  }
}

/**
 * Get historical daily price data using Yahoo Finance chart API.
 */
export async function getHistory(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<NewStockPrice[]> {
  try {
    const period1 = Math.floor(new Date(startDate).getTime() / 1000);
    const period2 = Math.floor(new Date(endDate).getTime() / 1000) + 86400; // Include end date

    const { data } = await axios.get(
      `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}`,
      {
        params: {
          period1,
          period2,
          interval: '1d',
          events: 'history',
        },
        headers: HEADERS,
        timeout: 15000,
      }
    );

    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp || [];
    const indicators = result.indicators?.quote?.[0];
    if (!indicators) return [];

    const opens: (number | null)[] = indicators.open || [];
    const closes: (number | null)[] = indicators.close || [];
    const highs: (number | null)[] = indicators.high || [];
    const lows: (number | null)[] = indicators.low || [];
    const volumes: (number | null)[] = indicators.volume || [];

    const prices: NewStockPrice[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i]! * 1000).toISOString().slice(0, 10);
      const close = closes[i];
      const prevClose = i > 0 ? closes[i - 1] : null;

      let changeRate: number | null = null;
      if (close && prevClose && prevClose > 0) {
        changeRate = Math.round(((close - prevClose) / prevClose) * 10000) / 100;
      }

      prices.push({
        ticker,
        date,
        open_price: opens[i] ?? null,
        close_price: close ?? null,
        high_price: highs[i] ?? null,
        low_price: lows[i] ?? null,
        volume: volumes[i] ?? null,
        change_rate: changeRate,
      });
    }

    return prices;
  } catch (error) {
    logger.error(`Yahoo Finance history failed for ${ticker}`, error);
    return [];
  }
}

function mapExchange(exchange: string | undefined): string {
  if (!exchange) return 'OTHER';
  const ex = exchange.toUpperCase();
  if (ex.includes('NAS') || ex === 'NMS') return 'NASDAQ';
  if (ex.includes('NYS') || ex === 'NYQ') return 'NYSE';
  if (ex.includes('KOS') || ex === 'KSC') return 'KOSPI';
  if (ex.includes('KOD') || ex === 'KOE') return 'KOSDAQ';
  return exchange;
}
