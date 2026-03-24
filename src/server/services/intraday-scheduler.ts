/**
 * Intraday Scheduler - hourly grade/review/predict during trading hours.
 *
 * KR markets: hourly from KST 08:00-15:00
 * US markets: hourly from ET 08:30-15:30
 *
 * Each hourly tick (same as daily but every hour):
 *   1. Grade — resolve ungraded predictions (price comparison)
 *   2. Review — LLM analyzes results, writes/updates intraday notes
 *   3. Predict — LLM reads updated notes + context, predicts next hour
 *   4. Record accuracy snapshot
 */

import cron from 'node-cron';
import * as dal from '../db/dal.js';
import { runIntradayPredictionAgent } from '../agents/intraday-prediction-agent.js';
import { runIntradayReviewAgent } from '../agents/intraday-review-agent.js';
import { fetchCurrentPrice, ensureIntradayPrices } from './stock-api.js';
import { judgeCorrectness, determineDirection } from './accuracy.js';
import {
  getLocalTimeForMarket,
  getLocalDateForMarket,
  getPendingIntradaySlots,
  isTradingDay,
} from '../utils/market-time.js';
import { logger } from '../utils/logger.js';

let intradayPredictionLock = false;
const intradayCronTasks: cron.ScheduledTask[] = [];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Grade unresolved intraday predictions for a stock.
 * Compares reference_price with current price to determine actual direction.
 */
async function gradeIntradayPredictions(
  stock: { ticker: string; market: string },
  date: string,
  flatThreshold: number
): Promise<void> {
  // Grade ALL unresolved predictions (not just today — catches yesterday's leftovers)
  const unresolved = dal.getUnresolvedIntradayPredictions(stock.ticker);
  if (unresolved.length === 0) return;

  const currentQuote = await fetchCurrentPrice(stock as any);
  if (!currentQuote) {
    logger.warn(`Cannot grade intraday predictions for ${stock.ticker}: no current price`);
    return;
  }

  for (const pred of unresolved) {
    // Only grade if target time has passed
    const { hour, minute, date: localDate } = getLocalTimeForMarket(stock.market);

    // Past dates: always grade (target time definitely passed)
    // Today: only grade if current time >= target time
    if (pred.prediction_date === localDate) {
      const nowMinutes = hour * 60 + minute;
      const targetMinutes = pred.target_hour * 60 + pred.target_minute;
      if (nowMinutes < targetMinutes) continue;
    }

    if (pred.reference_price === null) continue;

    const changeRate = ((currentQuote.price - pred.reference_price) / pred.reference_price) * 100;
    const roundedChangeRate = Math.round(changeRate * 100) / 100;
    const actualDir = determineDirection(roundedChangeRate, flatThreshold);
    const isCorrectRaw = judgeCorrectness(pred.direction, roundedChangeRate, flatThreshold);
    const isCorrect = isCorrectRaw === true ? 1 : isCorrectRaw === false ? 0 : null;

    dal.updateIntradayPredictionResult(pred.id, {
      actual_direction: actualDir,
      actual_change_rate: roundedChangeRate,
      actual_price: currentQuote.price,
      is_correct: isCorrect,
    });

    const correctLabel = isCorrect === 1 ? 'CORRECT' : isCorrect === 0 ? 'INCORRECT' : 'N/A';
    logger.info(`Intraday graded ${stock.ticker} ${pred.prediction_hour}:${String(pred.prediction_minute).padStart(2, '0')}: ${pred.direction} vs ${actualDir} (${roundedChangeRate.toFixed(2)}%) = ${correctLabel}`);
  }
}

/**
 * Run the hourly intraday prediction cycle for a set of markets.
 */
async function runIntradayHourlyCycle(markets: string[]): Promise<void> {
  if (intradayPredictionLock) {
    logger.warn('Intraday prediction cycle already running, skipping');
    return;
  }
  intradayPredictionLock = true;

  try {
    // Get flat threshold from settings
    const generalSettings = dal.getSetting<{ intradayFlatThreshold?: number }>('general');
    const flatThreshold = generalSettings?.intradayFlatThreshold ?? 0.15;

    let stocks = dal.getActiveStocks();
    stocks = stocks.filter(s => markets.includes(s.market));

    if (stocks.length === 0) return;

    const llmConfigs = dal.getActiveLLMConfigs();
    const representativeMarket = stocks[0]!.market;
    const date = getLocalDateForMarket(representativeMarket);

    if (!isTradingDay(date)) {
      logger.debug(`Intraday: ${date} is not a trading day, skipping`);
      return;
    }

    // Get all pending slots (includes missed ones from slow previous cycles)
    const pendingSlots = getPendingIntradaySlots(representativeMarket);

    logger.info(`=== Intraday hourly cycle for ${markets.join('/')} | date=${date} | pendingSlots=${pendingSlots.length} (${pendingSlots.map(s => `${s.predictAtHour}:${String(s.predictAtMinute).padStart(2, '0')}`).join(',')}) ===`);

    // Step 1: Grade ALL unresolved predictions
    for (const stock of stocks) {
      try {
        await gradeIntradayPredictions(stock, date, flatThreshold);
      } catch (error) {
        logger.error(`Intraday grading failed for ${stock.ticker}`, error);
      }
    }

    // Step 2: Review — run intraday review agent per stock per LLM (writes notes BEFORE next prediction)
    for (const stock of stocks) {
      const gradedPreds = dal.getIntradayPredictionsForDate(stock.ticker, date);
      const hasGraded = gradedPreds.some(p => p.is_correct !== null);
      if (!hasGraded) continue; // Skip review if nothing graded yet

      for (let i = 0; i < llmConfigs.length; i++) {
        const config = llmConfigs[i]!;
        const llmPreds = gradedPreds.filter(p => p.llm_id === config.id);
        if (llmPreds.length === 0) continue;

        try {
          await runIntradayReviewAgent(stock, llmPreds, config);
        } catch (error) {
          logger.error(`Intraday review failed for ${stock.ticker} [LLM: ${config.id}]`, error);
        }

        if (i < llmConfigs.length - 1) {
          await delay(3000);
        }
      }
    }

    // Step 3: Predict — make predictions for all pending slots (notes are now updated from step 2)
    for (const slot of pendingSlots) {
      for (const stock of stocks) {
        await ensureIntradayPrices(stock);

        for (let i = 0; i < llmConfigs.length; i++) {
          const config = llmConfigs[i]!;
          try {
            await runIntradayPredictionAgent(stock, slot, date, config);
          } catch (error) {
            logger.error(`Intraday prediction failed for ${stock.ticker} [LLM: ${config.id}]`, error);
          }

          if (i < llmConfigs.length - 1) {
            await delay(3000);
          }
        }
      }
    }

    // Step 4: Record accuracy snapshots
    const overallStats = dal.getIntradayAccuracyStats();
    dal.recordIntradayAccuracySnapshot(date, overallStats, 'overall');

    for (const config of llmConfigs) {
      const llmStats = dal.getIntradayAccuracyStats(undefined, config.id);
      dal.recordIntradayAccuracySnapshot(date, llmStats, config.id);
    }

    logger.info('=== Intraday hourly cycle complete ===');
  } finally {
    intradayPredictionLock = false;
  }
}

/**
 * Grade any leftover unresolved predictions on startup (e.g., after deployment).
 */
async function gradeLeftoversOnStartup(): Promise<void> {
  try {
    const generalSettings = dal.getSetting<{ intradayFlatThreshold?: number }>('general');
    const flatThreshold = generalSettings?.intradayFlatThreshold ?? 0.15;
    const stocks = dal.getActiveStocks();

    for (const stock of stocks) {
      await gradeIntradayPredictions(stock, '', flatThreshold);
    }
    logger.info('Startup: graded leftover intraday predictions');
  } catch (error) {
    logger.warn('Startup grading failed', error);
  }
}

/**
 * Initialize intraday scheduler with market-specific cron jobs.
 */
export function initIntradayScheduler(): void {
  // Grade any leftovers from before restart
  gradeLeftoversOnStartup().catch(() => {});
  // KR markets (KOSPI/KOSDAQ): hourly KST 08:00-15:00 = UTC 23:00-06:00
  // Cron: every hour, minutes=0, hours 23,0,1,2,3,4,5,6 UTC, weekdays only
  const krHourlyTask = cron.schedule(
    '0 23,0,1,2,3,4,5,6 * * 0-6',
    () => {
      logger.info('Cron: Intraday hourly cycle triggered for KR markets');
      runIntradayHourlyCycle(['KOSPI', 'KOSDAQ']).catch(error => {
        logger.error('Intraday hourly cycle failed for KR', error);
      });
    },
    { timezone: 'UTC' }
  );
  intradayCronTasks.push(krHourlyTask);

  // KR review removed — review now runs every hourly cycle before predictions

  // US markets (NASDAQ): hourly at :30, during ET 08:30-15:30
  // EST: UTC 13:30-20:30, EDT: UTC 12:30-19:30
  // Conservative range: run at :30 from UTC 12-20
  const usHourlyTask = cron.schedule(
    '30 12,13,14,15,16,17,18,19,20 * * 0-6',
    () => {
      logger.info('Cron: Intraday hourly cycle triggered for US markets');
      runIntradayHourlyCycle(['NASDAQ']).catch(error => {
        logger.error('Intraday hourly cycle failed for US', error);
      });
    },
    { timezone: 'UTC' }
  );
  intradayCronTasks.push(usHourlyTask);

  // US review removed — review now runs every hourly cycle before predictions

  logger.info('Intraday scheduler initialized: KR hourly(UTC 23,0-6:00), US hourly(UTC 12-20:30) — each cycle: grade → review → predict');
}

/**
 * Stop the intraday scheduler.
 */
export function stopIntradayScheduler(): void {
  intradayCronTasks.forEach(t => t.stop());
  intradayCronTasks.length = 0;
}

/**
 * Manually trigger an intraday prediction cycle for testing.
 */
export async function triggerIntradayManual(markets: string[]): Promise<void> {
  await runIntradayHourlyCycle(markets);
}
