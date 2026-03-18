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

// === Real-time status tracking ===
export interface SchedulerStatus {
  phase: 'idle' | 'predicting' | 'reviewing';
  currentStock: string | null;
  currentLLM: string | null;
  progress: { completed: number; total: number };
  results: Array<{ ticker: string; llmId: string; status: 'success' | 'failed' | 'running' | 'pending'; direction?: string; error?: string; durationMs?: number; searchIteration?: number }>;
  startedAt: string | null;
  llmAvgDurations: Record<string, { totalMs: number; count: number; avgMs: number }>;
}

/** Update search iteration for a running result (called from prediction agent) */
export function updateSearchIteration(ticker: string, llmId: string, iteration: number): void {
  const idx = status.results.findIndex(r => r.ticker === ticker && r.llmId === llmId && r.status === 'running');
  if (idx >= 0) status.results[idx]!.searchIteration = iteration;
}

const status: SchedulerStatus = {
  phase: 'idle',
  currentStock: null,
  currentLLM: null,
  progress: { completed: 0, total: 0 },
  results: [],
  startedAt: null,
  llmAvgDurations: {},
};

export function getSchedulerStatus(): SchedulerStatus {
  return { ...status, results: [...status.results], llmAvgDurations: { ...status.llmAvgDurations } };
}

function recordDuration(llmId: string, durationMs: number): void {
  if (!status.llmAvgDurations[llmId]) {
    status.llmAvgDurations[llmId] = { totalMs: 0, count: 0, avgMs: 0 };
  }
  const entry = status.llmAvgDurations[llmId]!;
  entry.totalMs += durationMs;
  entry.count++;
  entry.avgMs = Math.round(entry.totalMs / entry.count);
}

/** Delay helper for rate limiting between LLM calls */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the next trading day (skips weekends) based on KST date.
 * Uses UTC methods with manual KST offset to be timezone-independent.
 */
function getNextTradingDay(fromDate?: Date): string {
  const now = fromDate || new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(kstMs);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Check if a given date string (YYYY-MM-DD) falls on a trading day (weekday).
 */
function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
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
  if (predictionLock || queueProcessing) {
    logger.warn('Prediction cycle or queue already running, skipping');
    return;
  }

  predictionLock = true;
  const targetDate = getNextTradingDay();
  logger.info(`=== Prediction cycle starting (target: ${targetDate}) ===`);

  try {
    const stocks = dal.getActiveStocks();
    const llmConfigs = dal.getActiveLLMConfigs();
    const total = stocks.length * llmConfigs.length;
    logger.info(`Processing ${stocks.length} active stocks for prediction with ${llmConfigs.length} active LLMs`);

    // Update status
    status.phase = 'predicting';
    status.progress = { completed: 0, total };
    status.results = [];
    status.startedAt = new Date().toISOString();

    // Initialize pending results
    for (const stock of stocks) {
      for (const config of llmConfigs) {
        status.results.push({ ticker: stock.ticker, llmId: config.id, status: 'pending' });
      }
    }

    for (const stock of stocks) {
      for (let i = 0; i < llmConfigs.length; i++) {
        const config = llmConfigs[i]!;
        status.currentStock = stock.ticker;
        status.currentLLM = config.id;

        // Mark as running
        const resultIdx = status.results.findIndex(r => r.ticker === stock.ticker && r.llmId === config.id);
        if (resultIdx >= 0) status.results[resultIdx]!.status = 'running';

        const startTime = Date.now();
        try {
          await runPredictionAgent(stock, config);
          const durationMs = Date.now() - startTime;
          if (resultIdx >= 0) {
            status.results[resultIdx]!.status = 'success';
            status.results[resultIdx]!.durationMs = durationMs;
            const pred = dal.getPrediction(stock.ticker, targetDate, config.id);
            if (pred) status.results[resultIdx]!.direction = pred.direction;
          }
          recordDuration(config.id, durationMs);
        } catch (error) {
          const durationMs = Date.now() - startTime;
          logger.error(`Prediction failed for ${stock.ticker} [LLM: ${config.id}]`, error);
          if (resultIdx >= 0) {
            status.results[resultIdx]!.status = 'failed';
            status.results[resultIdx]!.error = error instanceof Error ? error.message : String(error);
            status.results[resultIdx]!.durationMs = durationMs;
          }
        }

        status.progress.completed++;

        // Rate limit: 5-second delay between LLM calls
        if (i < llmConfigs.length - 1) {
          await delay(5000);
        }
      }
    }

    logger.info('=== Prediction cycle complete ===');
  } finally {
    predictionLock = false;
    status.phase = 'idle';
    status.currentStock = null;
    status.currentLLM = null;
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
    // Use KST date (UTC methods to avoid TZ=Asia/Seoul double-offset)
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

    // Also resolve any older unresolved predictions (only past dates, never future)
    const unresolved = dal.getUnresolvedPredictions();
    for (const pred of unresolved) {
      try {
        // Skip future predictions - they haven't happened yet
        if (pred.prediction_date > today) continue;

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

        // Rate limit: 5-second delay between LLM calls
        if (i < llmConfigs.length - 1) {
          await delay(5000);
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

// === Prediction Queue ===
const predictionQueue: Stock[] = [];
let queueProcessing = false;

/** Process a single stock's predictions (used by concurrent queue). */
async function processStockPrediction(stock: Stock): Promise<void> {
  logger.info(`Queue: Processing ${stock.ticker}`);

  try {
    await ensureRecentPrices(stock, 35);

    const llmConfigs = dal.getActiveLLMConfigs();
    if (llmConfigs.length === 0) {
      await runPredictionAgent(stock);
      return;
    }

    for (let i = 0; i < llmConfigs.length; i++) {
      const config = llmConfigs[i]!;

      // Find or create result entry
      let resultIdx = status.results.findIndex(r => r.ticker === stock.ticker && r.llmId === config.id);
      if (resultIdx < 0) {
        status.results.push({ ticker: stock.ticker, llmId: config.id, status: 'running' });
        resultIdx = status.results.length - 1;
      } else {
        status.results[resultIdx]!.status = 'running';
      }

      const startTime = Date.now();
      try {
        await runPredictionAgent(stock, config);
        const durationMs = Date.now() - startTime;
        status.results[resultIdx]!.status = 'success';
        status.results[resultIdx]!.durationMs = durationMs;
        const targetDate = getNextTradingDay();
        const pred = dal.getPrediction(stock.ticker, targetDate, config.id);
        if (pred) status.results[resultIdx]!.direction = pred.direction;
        recordDuration(config.id, durationMs);
      } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error(`Prediction failed for ${stock.ticker} [LLM: ${config.id}]`, error);
        status.results[resultIdx]!.status = 'failed';
        status.results[resultIdx]!.error = error instanceof Error ? error.message : String(error);
        status.results[resultIdx]!.durationMs = durationMs;
      }

      status.progress.completed++;

      // Rate limit: 5-second delay between LLM calls for the same stock
      if (i < llmConfigs.length - 1) {
        await delay(5000);
      }
    }
  } catch (error) {
    logger.error(`Queue: Failed for ${stock.ticker}`, error);
  }
}

async function processQueue(): Promise<void> {
  if (queueProcessing || predictionQueue.length === 0) return;
  queueProcessing = true;

  while (predictionQueue.length > 0) {
    const stock = predictionQueue.shift()!;
    logger.info(`Queue: Processing ${stock.ticker} (${predictionQueue.length} remaining)`);

    // Update status
    status.phase = 'predicting';
    status.startedAt = status.startedAt || new Date().toISOString();

    await processStockPrediction(stock);

    // 3-second delay between stocks
    if (predictionQueue.length > 0) {
      await delay(3000);
    }
  }

  queueProcessing = false;
  status.phase = 'idle';
  status.currentStock = null;
  status.currentLLM = null;
  logger.info('Queue: All immediate predictions complete');
}

/**
 * Trigger immediate prediction for a specific stock (queued, sequential).
 */
export async function triggerImmediatePrediction(stock: Stock): Promise<void> {
  logger.info(`Queuing immediate prediction for ${stock.ticker}`);

  const llmConfigs = dal.getActiveLLMConfigs();

  // Add pending results
  for (const config of llmConfigs) {
    const exists = status.results.find(r => r.ticker === stock.ticker && r.llmId === config.id);
    if (!exists) {
      status.results.push({ ticker: stock.ticker, llmId: config.id, status: 'pending' });
    }
  }
  status.progress.total += llmConfigs.length;
  if (!status.startedAt) status.startedAt = new Date().toISOString();

  predictionQueue.push(stock);

  // Start processing if not already running
  processQueue().catch(err => logger.error('Queue processing error', err));
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
