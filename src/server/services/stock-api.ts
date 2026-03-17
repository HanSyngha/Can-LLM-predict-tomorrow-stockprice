/**
 * Unified Stock API with DB caching.
 * Uses Yahoo Finance for all markets (KOSPI/KOSDAQ/NASDAQ/NYSE).
 * Checks DB first, only fetches missing dates from external API.
 *
 * Smart search: tries Yahoo first, then uses LLM to translate
 * non-English queries to tickers and verifies on Yahoo.
 */

import type { Stock, NewStockPrice, TickerSearchResult } from '../types/index.js';
import * as dal from '../db/dal.js';
import * as yahoo from './yahoo-client.js';
import { LLMClient } from '../llm/llm-client.js';
import { getProviderConfig } from '../types/provider.js';
import type { LLMProvider } from '../types/provider.js';
import { logger } from '../utils/logger.js';

/**
 * Smart ticker search:
 * 1. Try Yahoo Finance search directly
 * 2. If no results, use LLM to find the English name/ticker
 * 3. Verify found tickers on Yahoo Finance
 * 4. Return verified results
 */
export async function searchTicker(query: string): Promise<TickerSearchResult[]> {
  // Step 1: Try Yahoo directly
  const directResults = await yahoo.searchTicker(query);
  if (directResults.length > 0) {
    return directResults;
  }

  // Step 2: No results - use LLM to translate/find ticker
  logger.info(`Yahoo search returned no results for "${query}", trying LLM-assisted search`);

  const searchLlmConfig = getSearchLLMConfig();
  if (!searchLlmConfig) {
    logger.warn('No search LLM configured, cannot perform smart search');
    return [];
  }

  try {
    const client = new LLMClient({
      baseUrl: searchLlmConfig.baseUrl,
      apiKey: searchLlmConfig.apiKey,
      model: searchLlmConfig.model,
      provider: searchLlmConfig.provider as LLMProvider,
      providerConfig: getProviderConfig(searchLlmConfig.provider),
    });

    const response = await client.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a stock ticker lookup assistant. When given a stock name (in any language), return the Yahoo Finance ticker symbol(s).

Rules:
- Korean KOSPI stocks use .KS suffix (e.g., 005930.KS for Samsung Electronics)
- Korean KOSDAQ stocks use .KQ suffix (e.g., 460860.KQ for 더본코리아)
- US stocks have no suffix (e.g., AAPL, TSLA)
- Return ONLY a JSON array of objects with "ticker", "name" (English name), "market", and "name_ko" (Korean name, only for KOSPI/KOSDAQ stocks) fields
- Example: [{"ticker": "005930.KS", "name": "Samsung Electronics", "market": "KOSPI", "name_ko": "삼성전자"}]
- For non-Korean stocks, omit name_ko or set it to null
- If you're not sure, return your best guesses (up to 5)
- DO NOT include any explanation, ONLY the JSON array`,
        },
        {
          role: 'user',
          content: `Find Yahoo Finance ticker(s) for: ${query}`,
        },
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    const tickers = parseLLMTickerResponse(content);

    if (tickers.length === 0) {
      logger.warn(`LLM returned no parseable tickers for "${query}"`);
      return [];
    }

    // Step 3: Verify each ticker on Yahoo Finance
    const verified: TickerSearchResult[] = [];
    for (const candidate of tickers) {
      const quote = await yahoo.getQuote(candidate.ticker);
      if (quote) {
        verified.push({
          ticker: candidate.ticker,
          name: candidate.name,
          name_ko: candidate.name_ko || null,
          market: candidate.market,
          apiSource: 'YAHOO',
        });
      } else {
        logger.debug(`LLM suggested ticker ${candidate.ticker} but Yahoo verification failed`);
      }
    }

    if (verified.length > 0) {
      logger.info(`LLM-assisted search found ${verified.length} verified results for "${query}"`);
    }

    return verified;
  } catch (error) {
    logger.error('LLM-assisted search failed', error);
    return [];
  }
}

/**
 * Parse LLM response for ticker info.
 * Handles various response formats (JSON array, plain text, etc.)
 */
function parseLLMTickerResponse(content: string): Array<{ ticker: string; name: string; name_ko?: string | null; market: string }> {
  // Try to extract JSON array from response
  const jsonMatch = content.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: unknown) => {
            const obj = item as Record<string, unknown>;
            return obj && typeof obj.ticker === 'string';
          })
          .map((item: unknown) => {
            const obj = item as Record<string, unknown>;
            return {
              ticker: String(obj.ticker),
              name: String(obj.name || ''),
              name_ko: typeof obj.name_ko === 'string' ? obj.name_ko : null,
              market: String(obj.market || guessMarket(String(obj.ticker))),
            };
          })
          .slice(0, 5);
      }
    } catch {
      // JSON parse failed, try regex
    }
  }

  // Fallback: extract ticker-like patterns from text
  const tickerPatterns = content.match(/\b\d{6}\.[KQ][SQ]\b|\b[A-Z]{1,5}\b/g);
  if (tickerPatterns) {
    return [...new Set(tickerPatterns)]
      .slice(0, 5)
      .map(ticker => ({
        ticker,
        name: '',
        name_ko: null,
        market: guessMarket(ticker),
      }));
  }

  return [];
}

function guessMarket(ticker: string): string {
  if (ticker.endsWith('.KS')) return 'KOSPI';
  if (ticker.endsWith('.KQ')) return 'KOSDAQ';
  return 'NYSE';
}

/**
 * Get the search LLM configuration.
 * Uses the 'search_llm' setting, defaults to glm-5-turbo.
 */
function getSearchLLMConfig(): { baseUrl: string; apiKey: string; model: string; provider: string } | null {
  // Check if there's a dedicated search LLM setting
  const searchLlm = dal.getSetting<{ baseUrl: string; apiKey: string; model: string; provider: string }>('search_llm');
  if (searchLlm) return searchLlm;

  // Fallback: try to find glm-5-turbo in LLM configs
  const configs = dal.getLLMConfigs();
  const turbo = configs.find(c => c.model === 'glm-5-turbo' && c.isActive);
  if (turbo) {
    return { baseUrl: turbo.baseUrl, apiKey: turbo.apiKey, model: turbo.model, provider: turbo.provider };
  }

  // Fallback: use first active LLM config
  const first = configs.find(c => c.isActive);
  if (first) {
    return { baseUrl: first.baseUrl, apiKey: first.apiKey, model: first.model, provider: first.provider };
  }

  return null;
}

// === Price data functions (unchanged) ===

/**
 * Fetch price history with DB caching.
 * Only fetches dates not already in DB.
 */
export async function fetchPriceHistory(
  stock: Stock,
  startDate: string,
  endDate: string
): Promise<void> {
  const cachedDates = dal.getCachedDates(stock.ticker, startDate, endDate);

  const missingDates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      const dateStr = current.toISOString().slice(0, 10);
      if (!cachedDates.has(dateStr)) {
        missingDates.push(dateStr);
      }
    }
    current.setDate(current.getDate() + 1);
  }

  if (missingDates.length === 0) {
    logger.debug(`All dates cached for ${stock.ticker} [${startDate} - ${endDate}]`);
    return;
  }

  logger.info(`Fetching ${missingDates.length} missing dates for ${stock.ticker}`);

  const prices = await yahoo.getHistory(stock.ticker, startDate, endDate);

  if (prices.length > 0) {
    dal.upsertPrices(prices);
    logger.info(`Cached ${prices.length} prices for ${stock.ticker}`);
  }
}

/**
 * Fetch current day price for a stock.
 */
export async function fetchCurrentPrice(
  stock: Stock
): Promise<{ price: number; changeRate: number } | null> {
  return yahoo.getQuote(stock.ticker);
}

/**
 * Ensure the last N days of price data is available in DB.
 */
export async function ensureRecentPrices(stock: Stock, days = 30): Promise<void> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - (days + 5) * 86400_000)
    .toISOString()
    .slice(0, 10);

  await fetchPriceHistory(stock, startDate, endDate);
}

/**
 * Get today's actual result for a prediction date.
 */
export async function fetchTodayResult(
  stock: Stock,
  date: string
): Promise<NewStockPrice | null> {
  const cached = dal.getPrice(stock.ticker, date);
  if (cached && cached.close_price !== null) {
    return cached;
  }

  const current = await fetchCurrentPrice(stock);
  if (!current) return null;

  for (let i = 1; i <= 5; i++) {
    const checkDate = new Date(date);
    checkDate.setDate(checkDate.getDate() - i);
    const checkDateStr = checkDate.toISOString().slice(0, 10);
    const prevPrice = dal.getPrice(stock.ticker, checkDateStr);
    if (prevPrice && prevPrice.close_price !== null) {
      const changeRate =
        ((current.price - prevPrice.close_price) / prevPrice.close_price) * 100;

      const priceData: NewStockPrice = {
        ticker: stock.ticker,
        date,
        close_price: current.price,
        change_rate: Math.round(changeRate * 100) / 100,
      };

      dal.upsertPrice(priceData);
      return priceData;
    }
  }

  const priceData: NewStockPrice = {
    ticker: stock.ticker,
    date,
    close_price: current.price,
    change_rate: current.changeRate,
  };
  dal.upsertPrice(priceData);
  return priceData;
}
