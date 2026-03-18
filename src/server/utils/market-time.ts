/**
 * Market-aware timezone and trading day utilities.
 *
 * Each market has its own timezone, close time, prediction time, and review time.
 * All internal calculations use UTC to avoid TZ=Asia/Seoul double-offset issues.
 */

export interface MarketTimezone {
  utcOffsetHours: number;
  closeHour: number;       // local hour market closes
  closeMinute: number;     // local minute market closes
  predictionCronUTC: string;  // cron expression in UTC for prediction cycle
  reviewCronUTC: string;      // cron expression in UTC for review cycle
}

const MARKET_TIMEZONES: Record<string, MarketTimezone> = {
  // Korean markets: KST (UTC+9), close 15:30 KST
  // Prediction: KST 00:00 = UTC 15:00 (prev day)
  // Review: KST 20:00 = UTC 11:00
  KOSPI:  { utcOffsetHours: 9, closeHour: 15, closeMinute: 30, predictionCronUTC: '0 15 * * *', reviewCronUTC: '0 11 * * *' },
  KOSDAQ: { utcOffsetHours: 9, closeHour: 15, closeMinute: 30, predictionCronUTC: '0 15 * * *', reviewCronUTC: '0 11 * * *' },

  // US markets: ET (UTC-5 winter / UTC-4 summer). Using UTC-5 (EST) as base.
  // Close: 16:00 ET = 21:00 UTC
  // Prediction: ET 08:00 = UTC 13:00 (before market open)
  // Review: ET 19:00 = UTC 00:00 (next day) - 3 hours after close for data settlement
  NASDAQ: { utcOffsetHours: -5, closeHour: 16, closeMinute: 0, predictionCronUTC: '0 13 * * *', reviewCronUTC: '0 0 * * *' },
  NYSE:   { utcOffsetHours: -5, closeHour: 16, closeMinute: 0, predictionCronUTC: '0 13 * * *', reviewCronUTC: '0 0 * * *' },
};

// Default to Korean market
const DEFAULT_TIMEZONE: MarketTimezone = MARKET_TIMEZONES.KOSPI!;

export function getMarketTimezone(market: string): MarketTimezone {
  return MARKET_TIMEZONES[market] || DEFAULT_TIMEZONE;
}

/**
 * Get the next upcoming trading day for a specific market.
 * Before market close (local time): returns today if weekday.
 * After market close: returns next weekday.
 */
export function getNextTradingDayForMarket(market: string, fromDate?: Date): string {
  const tz = getMarketTimezone(market);
  const now = fromDate || new Date();
  const localMs = now.getTime() + tz.utcOffsetHours * 60 * 60 * 1000;
  const d = new Date(localMs);
  const localHour = d.getUTCHours();
  const localMinute = d.getUTCMinutes();

  // After market close, move to next day
  if (localHour > tz.closeHour || (localHour === tz.closeHour && localMinute >= tz.closeMinute)) {
    d.setUTCDate(d.getUTCDate() + 1);
  }

  // Skip weekends
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Get the last (most recent) trading day for a specific market.
 */
export function getLastTradingDayForMarket(market: string, fromDate?: Date): string {
  const tz = getMarketTimezone(market);
  const now = fromDate || new Date();
  const localMs = now.getTime() + tz.utcOffsetHours * 60 * 60 * 1000;
  const d = new Date(localMs);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Get local date string (YYYY-MM-DD) for a market's timezone.
 */
export function getLocalDateForMarket(market: string, fromDate?: Date): string {
  const tz = getMarketTimezone(market);
  const now = fromDate || new Date();
  const d = new Date(now.getTime() + tz.utcOffsetHours * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Check if a date string is a trading day (weekday).
 */
export function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Determine which market group a stock belongs to.
 * Returns 'KR' for Korean markets, 'US' for US markets.
 */
export function getMarketGroup(market: string): 'KR' | 'US' {
  if (market === 'KOSPI' || market === 'KOSDAQ') return 'KR';
  if (market === 'NASDAQ' || market === 'NYSE') return 'US';
  // Default: check if market string contains hints
  if (market.includes('KOS') || market.includes('KR')) return 'KR';
  return 'US';
}

/**
 * Get all unique market group configs for scheduling.
 */
export function getMarketGroupConfigs(): Array<{
  group: 'KR' | 'US';
  markets: string[];
  predictionCronUTC: string;
  reviewCronUTC: string;
  utcOffsetHours: number;
}> {
  return [
    {
      group: 'KR',
      markets: ['KOSPI', 'KOSDAQ'],
      predictionCronUTC: '0 15 * * *',  // KST 00:00
      reviewCronUTC: '0 11 * * *',       // KST 20:00
      utcOffsetHours: 9,
    },
    {
      group: 'US',
      markets: ['NASDAQ', 'NYSE'],
      predictionCronUTC: '0 13 * * *',  // ET 08:00
      reviewCronUTC: '0 0 * * *',        // ET 19:00
      utcOffsetHours: -5,
    },
  ];
}
