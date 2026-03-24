/**
 * Market-aware timezone and trading day utilities.
 *
 * Each market has its own timezone, close time, prediction time, and review time.
 * All internal calculations use UTC to avoid TZ=Asia/Seoul double-offset issues.
 */

export interface MarketTimezone {
  getUtcOffsetHours: () => number;  // function to handle DST
  closeHour: number;       // local hour market closes
  closeMinute: number;     // local minute market closes
  predictionCronUTC: string;  // cron expression in UTC for prediction cycle
  reviewCronUTC: string;      // cron expression in UTC for review cycle
}

/**
 * Determine US Eastern Time UTC offset based on DST rules.
 * DST starts 2nd Sunday of March, ends 1st Sunday of November.
 */
function getUSEasternOffset(): number {
  const now = new Date();
  const year = now.getUTCFullYear();

  // Find 2nd Sunday of March
  const mar1 = new Date(Date.UTC(year, 2, 1)); // March 1
  const marSunday = 1 + ((7 - mar1.getUTCDay()) % 7); // first Sunday
  const dstStart = new Date(Date.UTC(year, 2, marSunday + 7, 7)); // 2nd Sunday, 2AM ET = 7AM UTC

  // Find 1st Sunday of November
  const nov1 = new Date(Date.UTC(year, 10, 1)); // November 1
  const novSunday = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = new Date(Date.UTC(year, 10, novSunday, 6)); // 1st Sunday, 2AM ET = 6AM UTC

  return (now >= dstStart && now < dstEnd) ? -4 : -5;
}

const MARKET_TIMEZONES: Record<string, MarketTimezone> = {
  // Korean markets: KST (UTC+9, no DST)
  KOSPI:  { getUtcOffsetHours: () => 9, closeHour: 15, closeMinute: 30, predictionCronUTC: '0 15 * * *', reviewCronUTC: '0 11 * * *' },
  KOSDAQ: { getUtcOffsetHours: () => 9, closeHour: 15, closeMinute: 30, predictionCronUTC: '0 15 * * *', reviewCronUTC: '0 11 * * *' },

  // US markets: ET (UTC-5 EST / UTC-4 EDT, DST-aware)
  // Cron times set conservatively to work for both EST and EDT:
  // Prediction: UTC 12:00 = ET 07:00(EST) or 08:00(EDT) - always before 09:30 open
  // Review: UTC 22:00 = ET 17:00(EST) or 18:00(EDT) - always after 16:00 close
  NASDAQ: { getUtcOffsetHours: getUSEasternOffset, closeHour: 16, closeMinute: 0, predictionCronUTC: '0 12 * * *', reviewCronUTC: '0 22 * * *' },
  NYSE:   { getUtcOffsetHours: getUSEasternOffset, closeHour: 16, closeMinute: 0, predictionCronUTC: '0 12 * * *', reviewCronUTC: '0 22 * * *' },
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
  const localMs = now.getTime() + tz.getUtcOffsetHours() * 60 * 60 * 1000;
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
  const localMs = now.getTime() + tz.getUtcOffsetHours() * 60 * 60 * 1000;
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
  const d = new Date(now.getTime() + tz.getUtcOffsetHours() * 60 * 60 * 1000);
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
}> {
  return [
    {
      group: 'KR',
      markets: ['KOSPI', 'KOSDAQ'],
      predictionCronUTC: MARKET_TIMEZONES.KOSPI!.predictionCronUTC,
      reviewCronUTC: MARKET_TIMEZONES.KOSPI!.reviewCronUTC,
    },
    {
      group: 'US',
      markets: ['NASDAQ', 'NYSE'],
      predictionCronUTC: MARKET_TIMEZONES.NASDAQ!.predictionCronUTC,
      reviewCronUTC: MARKET_TIMEZONES.NASDAQ!.reviewCronUTC,
    },
  ];
}

// === Intraday Schedule Utilities ===

export interface IntradaySlot {
  predictAtHour: number;
  predictAtMinute: number;
  targetHour: number;
  targetMinute: number;
}

/**
 * Get all intraday prediction slots for a market.
 * KOSPI/KOSDAQ: 08:00→09:00, 09:00→10:00, ..., 14:00→15:00 (7 slots)
 * NASDAQ: 08:30→09:30, 09:30→10:30, ..., 14:30→15:30 (7 slots)
 */
export function getIntradaySlots(market: string): IntradaySlot[] {
  if (market === 'KOSPI' || market === 'KOSDAQ') {
    const slots: IntradaySlot[] = [];
    for (let h = 8; h <= 14; h++) {
      slots.push({ predictAtHour: h, predictAtMinute: 0, targetHour: h + 1, targetMinute: 0 });
    }
    return slots;
  }
  if (market === 'NASDAQ') {
    const slots: IntradaySlot[] = [];
    for (let h = 8; h <= 14; h++) {
      slots.push({ predictAtHour: h, predictAtMinute: 30, targetHour: h + 1, targetMinute: 30 });
    }
    return slots;
  }
  return [];
}

/**
 * Get current local time for a market (hour, minute, date).
 */
export function getLocalTimeForMarket(market: string): { hour: number; minute: number; date: string } {
  const tz = getMarketTimezone(market);
  const now = new Date();
  const localMs = now.getTime() + tz.getUtcOffsetHours() * 60 * 60 * 1000;
  const d = new Date(localMs);
  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    date: d.toISOString().slice(0, 10),
  };
}

/**
 * Get the current active intraday slot for a market.
 * Returns the slot that should run NOW, or null if outside trading hours.
 * "Active" means: we're at or past the prediction time, but before the next slot.
 */
export function getCurrentIntradaySlot(market: string): IntradaySlot | null {
  const { hour, minute, date } = getLocalTimeForMarket(market);
  if (!isTradingDay(date)) return null;

  const slots = getIntradaySlots(market);
  if (slots.length === 0) return null;

  const nowMinutes = hour * 60 + minute;

  // Find the most recent slot that we should execute
  let activeSlot: IntradaySlot | null = null;
  for (const slot of slots) {
    const slotMinutes = slot.predictAtHour * 60 + slot.predictAtMinute;
    // Slot is active if current time is within a 30-minute window of slot start
    if (nowMinutes >= slotMinutes && nowMinutes < slotMinutes + 30) {
      activeSlot = slot;
    }
  }

  return activeSlot;
}

/**
 * Get the previous slot whose prediction needs to be graded.
 * Returns the slot that predicted the price at the current slot's time.
 */
export function getPreviousIntradaySlot(market: string): IntradaySlot | null {
  const { hour, minute, date } = getLocalTimeForMarket(market);
  if (!isTradingDay(date)) return null;

  const slots = getIntradaySlots(market);
  const nowMinutes = hour * 60 + minute;

  // Find the slot before the current one (its target time has passed)
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i]!;
    const targetMinutes = slot.targetHour * 60 + slot.targetMinute;
    if (nowMinutes >= targetMinutes) {
      return slot;
    }
  }
  return null;
}

/**
 * Get all intraday slots whose prediction time has passed but haven't been executed yet.
 * Used to catch up on missed slots (e.g., if previous cycle was slow).
 */
export function getPendingIntradaySlots(market: string): IntradaySlot[] {
  const { hour, minute, date } = getLocalTimeForMarket(market);
  if (!isTradingDay(date)) return [];

  const slots = getIntradaySlots(market);
  const nowMinutes = hour * 60 + minute;

  // Return all slots whose prediction time has passed (not just the current 30-min window)
  return slots.filter(slot => {
    const slotMinutes = slot.predictAtHour * 60 + slot.predictAtMinute;
    return nowMinutes >= slotMinutes;
  });
}

/**
 * Check if current time is at the intraday review time (market close).
 * KOSPI: 15:30 KST, NASDAQ: 16:00 ET
 */
export function isIntradayReviewTime(market: string): boolean {
  const { hour, minute } = getLocalTimeForMarket(market);
  const tz = getMarketTimezone(market);
  const reviewMinutes = tz.closeHour * 60 + tz.closeMinute;
  const nowMinutes = hour * 60 + minute;
  // Within 30-minute window after market close
  return nowMinutes >= reviewMinutes && nowMinutes < reviewMinutes + 30;
}
