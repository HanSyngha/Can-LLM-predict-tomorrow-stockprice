/**
 * Scheduler - node-cron setup.
 *
 * KST 00:00 prediction cycle, KST 20:00 review cycle.
 * triggerImmediatePrediction().
 * Concurrency locks. Sequential stock processing.
 * Multi-LLM: runs all active LLMs for each stock.
 */

import cron from 'node-cron';
import type { Stock, LLMConfig } from '../types/index.js';
import * as dal from '../db/dal.js';
import { runPredictionAgent } from '../agents/prediction-agent.js';
import { runReviewAgent } from '../agents/review-agent.js';
import { ensureRecentPrices, fetchTodayResult } from './stock-api.js';
import { judgeCorrectness, determineDirection } from './accuracy.js';
import { logger } from '../utils/logger.js';

let predictionLock = false;
let reviewLock = false;
let predictionTask: cron.ScheduledTask | null = null;
let reviewTask: cron.ScheduledTask | null = null;

/** Delay helper for rate limiting between LLM calls */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the next trading day (skips weekends) from a given date.
 */
function getNextTradingDay(fromDate?: Date): string {
  const d = fromDate ? new Date(fromDate.getTime()) : new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Check if a given date string (YYYY-MM-DD) falls on a trading day (weekday).
 */
function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Run prediction cycle for all active stocks (sequential).
 * For each stock, runs predictions for ALL active LLMs with a 2-second delay between each.
 *
 * Always predicts for the next trading day regardless of current day.
 * The prediction agent itself calculates next trading day (skips weekends).
 */
async function runPredictionCycle(): Promise<void> {
  if (predictionLock) {
    logger.warn('Prediction cycle already running, skipping');
    return;
  }

  predictionLock = true;
  const targetDate = getNextTradingDay();
  logger.info(`=== Prediction cycle starting (target: ${targetDate}) ===`);

  try {
    const stocks = dal.getActiveStocks();
    const llmConfigs = dal.getActiveLLMConfigs();
    logger.info(`Processing ${stocks.length} active stocks for prediction with ${llmConfigs.length} active LLMs`);

    for (const stock of stocks) {
      for (let i = 0; i < llmConfigs.length; i++) {
        const config = llmConfigs[i]!;
        try {
          await runPredictionAgent(stock, config);
        } catch (error) {
          logger.error(`Prediction failed for ${stock.ticker} [LLM: ${config.id}]`, error);
        }

        // Rate limit: 2-second delay between LLM calls
        if (i < llmConfigs.length - 1) {
          await delay(2000);
        }
      }
    }

    logger.info('=== Prediction cycle complete ===');
  } finally {
    predictionLock = false;
  }
}

/**
 * Run review cycle for all active stocks (sequential).
 * 1. Fetch today's close for each stock (if today is a trading day)
 * 2. Compare with predictions where prediction_date = today
 * 3. Calculate change rate vs the reference price (last close before prediction)
 * 4. Run review agent for each stock and each LLM
 */
async function runReviewCycle(): Promise<void> {
  if (reviewLock) {
    logger.warn('Review cycle already running, skipping');
    return;
  }

  reviewLock = true;
  logger.info('=== Review cycle starting ===');

  try {
    const stocks = dal.getActiveStocks();
    const llmConfigs = dal.getActiveLLMConfigs();
    const today = new Date().toISOString().slice(0, 10);

    // Get flat threshold from settings
    const generalSettings = dal.getSetting<{ flatThreshold: number }>('general');
    const flatThreshold = generalSettings?.flatThreshold ?? 0.3;

    // Only process reviews on trading days
    if (!isTradingDay(today)) {
      logger.info(`Today (${today}) is not a trading day, skipping price resolution`);
    } else {
      // Step 1: Fetch today's prices and resolve predictions (for all LLMs)
      for (const stock of stocks) {
        try {
          // Ensure we have today's price
          const todayPrice = await fetchTodayResult(stock, today);

          if (!todayPrice || todayPrice.close_price === null || todayPrice.close_price === undefined) {
            logger.warn(`No price data for ${stock.ticker} on ${today}`);
            continue;
          }

          // Find predictions for today (for each LLM)
          for (const config of llmConfigs) {
            const prediction = dal.getPrediction(stock.ticker, today, config.id);
            if (!prediction || prediction.actual_direction !== null) {
              continue; // No prediction or already resolved
            }

            // Calculate change rate vs reference price.
            // Use todayPrice.change_rate if available (from API), otherwise compute from prediction baseline.
            let changeRate = todayPrice.change_rate;
            if (changeRate === null || changeRate === undefined) {
              // Fallback: compute from previous trading day's close
              // Get price data to find reference close
              const endDate = today;
              const startDate = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
              const prices = dal.getPriceRange(stock.ticker, startDate, endDate);
              const sorted = [...prices].sort((a, b) => b.date.localeCompare(a.date));
              const refPrice = sorted.find(p => p.date < today && p.close_price !== null);
              if (refPrice && refPrice.close_price && todayPrice.close_price) {
                changeRate = ((todayPrice.close_price - refPrice.close_price) / refPrice.close_price) * 100;
              }
            }

            if (changeRate === null || changeRate === undefined) {
              logger.warn(`Cannot compute change rate for ${stock.ticker} on ${today}`);
              continue;
            }

            // Judge correctness
            const actualDir = determineDirection(changeRate, flatThreshold);
            const isCorrect = judgeCorrectness(prediction.direction, changeRate, flatThreshold);

            dal.updatePredictionResult(stock.ticker, today, {
              actual_direction: actualDir,
              actual_change_rate: changeRate,
              actual_close_price: todayPrice.close_price ?? 0,
              is_correct: isCorrect === null ? null : isCorrect ? 1 : 0,
            }, config.id);

            logger.info(`Prediction resolved: ${stock.ticker} ${today} [LLM: ${config.id}] - predicted ${prediction.direction}, actual ${actualDir} (${isCorrect ? 'correct' : 'incorrect'})`);
          }
        } catch (error) {
          logger.error(`Price fetch/resolve failed for ${stock.ticker}`, error);
        }
      }
    }

    // Also resolve any older unresolved predictions
    const unresolved = dal.getUnresolvedPredictions();
    for (const pred of unresolved) {
      try {
        const stock = dal.getStockByTicker(pred.ticker);
        if (!stock) continue;

        const priceData = await fetchTodayResult(stock, pred.prediction_date);
        if (!priceData || priceData.change_rate === null || priceData.change_rate === undefined) continue;

        const actualDir = determineDirection(priceData.change_rate, flatThreshold);
        const isCorrect = judgeCorrectness(pred.direction, priceData.change_rate, flatThreshold);

        dal.updatePredictionResult(pred.ticker, pred.prediction_date, {
          actual_direction: actualDir,
          actual_change_rate: priceData.change_rate,
          actual_close_price: priceData.close_price ?? 0,
          is_correct: isCorrect === null ? null : isCorrect ? 1 : 0,
        }, pred.llm_id);
      } catch {
        // skip silently
      }
    }

    // Step 2: Run review agent for each stock and each LLM
    for (const stock of stocks) {
      for (let i = 0; i < llmConfigs.length; i++) {
        const config = llmConfigs[i]!;
        try {
          const prediction = dal.getPrediction(stock.ticker, today, config.id);
          if (!prediction || prediction.actual_direction === null) {
            logger.debug(`No resolved prediction for ${stock.ticker} [LLM: ${config.id}] on ${today}, skipping review`);
            continue;
          }
          if (prediction.direction === 'UNABLE') {
            logger.debug(`Skipping review for UNABLE prediction: ${stock.ticker} [LLM: ${config.id}]`);
            continue;
          }

          await runReviewAgent(stock, prediction, config);
        } catch (error) {
          logger.error(`Review failed for ${stock.ticker} [LLM: ${config.id}]`, error);
        }

        // Rate limit: 2-second delay between LLM calls
        if (i < llmConfigs.length - 1) {
          await delay(2000);
        }
      }
    }

    // Step 3: Record accuracy snapshot (overall and per-LLM)
    const overallStats = dal.getAccuracyStats();
    dal.recordAccuracySnapshot(today, overallStats, 'overall');

    for (const config of llmConfigs) {
      const llmStats = dal.getAccuracyStats(undefined, config.id);
      dal.recordAccuracySnapshot(today, llmStats, config.id);
    }

    logger.info('=== Review cycle complete ===');
  } finally {
    reviewLock = false;
  }
}

/**
 * Trigger immediate prediction for a specific stock (runs all active LLMs).
 */
export async function triggerImmediatePrediction(stock: Stock): Promise<void> {
  logger.info(`Triggering immediate prediction for ${stock.ticker}`);

  try {
    // Ensure price history is available
    await ensureRecentPrices(stock, 35);

    const llmConfigs = dal.getActiveLLMConfigs();

    if (llmConfigs.length === 0) {
      // Fallback: run with default LLM settings
      await runPredictionAgent(stock);
      return;
    }

    // Run prediction for each active LLM
    for (let i = 0; i < llmConfigs.length; i++) {
      const config = llmConfigs[i]!;
      try {
        await runPredictionAgent(stock, config);
      } catch (error) {
        logger.error(`Immediate prediction failed for ${stock.ticker} [LLM: ${config.id}]`, error);
      }

      // Rate limit: 2-second delay between LLM calls
      if (i < llmConfigs.length - 1) {
        await delay(2000);
      }
    }
  } catch (error) {
    logger.error(`Immediate prediction failed for ${stock.ticker}`, error);
    throw error;
  }
}

/**
 * Initialize the scheduler.
 */
export function initScheduler(): void {
  // Get schedule settings from DB or use defaults
  const scheduleSettings = dal.getSetting<{ predictionCron: string; reviewCron: string }>('schedule');
  const predictionCron = scheduleSettings?.predictionCron || '0 0 * * *'; // 00:00
  const reviewCron = scheduleSettings?.reviewCron || '0 20 * * *'; // 20:00

  // KST 00:00 - Prediction cycle
  predictionTask = cron.schedule(
    predictionCron,
    () => {
      runPredictionCycle().catch(error => {
        logger.error('Prediction cycle failed', error);
      });
    },
    { timezone: 'Asia/Seoul' }
  );

  // KST 20:00 - Review cycle
  reviewTask = cron.schedule(
    reviewCron,
    () => {
      runReviewCycle().catch(error => {
        logger.error('Review cycle failed', error);
      });
    },
    { timezone: 'Asia/Seoul' }
  );

  logger.info(`Scheduler initialized: prediction=${predictionCron}, review=${reviewCron} (Asia/Seoul)`);
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  predictionTask?.stop();
  reviewTask?.stop();
  logger.info('Scheduler stopped');
}
