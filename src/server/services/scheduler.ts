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
import { getNextTradingDayForMarket, getLocalDateForMarket, getMarketGroupConfigs, isTradingDay } from '../utils/market-time.js';
import { logger } from '../utils/logger.js';

let predictionLock = false;
let reviewLock = false;
const cronTasks: cron.ScheduledTask[] = [];

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
 * Run prediction cycle for stocks in specific markets.
 * If marketFilter is provided, only processes stocks in those markets.
 */
async function runPredictionCycle(marketFilter?: string[]): Promise<void> {
  if (predictionLock || queueProcessing) {
    logger.warn('Prediction cycle or queue already running, skipping');
    return;
  }

  predictionLock = true;
  const filterLabel = marketFilter ? marketFilter.join('/') : 'ALL';
  logger.info(`=== Prediction cycle starting (markets: ${filterLabel}) ===`);

  try {
    let stocks = dal.getActiveStocks();
    if (marketFilter) {
      stocks = stocks.filter(s => marketFilter.includes(s.market));
    }
    if (stocks.length === 0) {
      logger.info('No stocks to predict for this market group');
      return;
    }
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
      const targetDate = getNextTradingDayForMarket(stock.market);
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
export async function runReviewCycle(marketFilter?: string[]): Promise<void> {
  if (reviewLock) {
    logger.warn('Review cycle already running, skipping');
    return;
  }

  reviewLock = true;
  const filterLabel = marketFilter ? marketFilter.join('/') : 'ALL';
  logger.info(`=== Review cycle starting (markets: ${filterLabel}) ===`);

  try {
    let stocks = dal.getActiveStocks();
    if (marketFilter) {
      stocks = stocks.filter(s => marketFilter.includes(s.market));
    }
    const llmConfigs = dal.getActiveLLMConfigs();

    // Get flat threshold from settings
    const generalSettings = dal.getSetting<{ flatThreshold: number }>('general');
    const flatThreshold = generalSettings?.flatThreshold ?? 0.3;

    // Step 1: Fetch today's prices and resolve predictions per stock's market timezone
    for (const stock of stocks) {
      const today = getLocalDateForMarket(stock.market);

      if (!isTradingDay(today)) {
        logger.debug(`${today} is not a trading day for ${stock.ticker}, skipping`);
        continue;
      }

      try {
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

    // Also resolve any older unresolved predictions (only past dates, never future)
    const unresolved = dal.getUnresolvedPredictions();
    for (const pred of unresolved) {
      try {
        // Skip predictions for today or future (market hasn't closed yet)
        const predStock = dal.getStockByTicker(pred.ticker);
        if (!predStock) continue;
        const predToday = getLocalDateForMarket(predStock.market);
        if (pred.prediction_date >= predToday) continue;

        const priceData = await fetchTodayResult(predStock, pred.prediction_date);
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
      const stockToday = getLocalDateForMarket(stock.market);
      for (let i = 0; i < llmConfigs.length; i++) {
        const config = llmConfigs[i]!;
        try {
          const prediction = dal.getPrediction(stock.ticker, stockToday, config.id);
          if (!prediction || prediction.actual_direction === null) {
            logger.debug(`No resolved prediction for ${stock.ticker} [LLM: ${config.id}] on ${stockToday}, skipping review`);
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

    // Step 3: Record accuracy snapshot (overall and per-LLM) — skip non-trading days
    const snapshotDate = stocks.length > 0
      ? getLocalDateForMarket(stocks[0]!.market)
      : new Date().toISOString().slice(0, 10);

    if (isTradingDay(snapshotDate)) {
      const overallStats = dal.getAccuracyStats();
      dal.recordAccuracySnapshot(snapshotDate, overallStats, 'overall');

      for (const config of llmConfigs) {
        const llmStats = dal.getAccuracyStats(undefined, config.id);
        dal.recordAccuracySnapshot(snapshotDate, llmStats, config.id);
      }
    } else {
      logger.debug(`Skipping accuracy snapshot on non-trading day ${snapshotDate}`);
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
        const targetDate = getNextTradingDayForMarket(stock.market);
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
 * Initialize the scheduler with per-market cron jobs.
 */
export function initScheduler(): void {
  const marketGroups = getMarketGroupConfigs();

  for (const group of marketGroups) {
    // Prediction cron (UTC)
    const predTask = cron.schedule(
      group.predictionCronUTC,
      () => {
        logger.info(`Cron: Prediction cycle triggered for ${group.group} markets`);
        runPredictionCycle(group.markets).catch(error => {
          logger.error(`Prediction cycle failed for ${group.group}`, error);
        });
      },
      { timezone: 'UTC' }
    );
    cronTasks.push(predTask);

    // Review cron (UTC)
    const reviewTask = cron.schedule(
      group.reviewCronUTC,
      () => {
        logger.info(`Cron: Review cycle triggered for ${group.group} markets`);
        runReviewCycle(group.markets).catch(error => {
          logger.error(`Review cycle failed for ${group.group}`, error);
        });
      },
      { timezone: 'UTC' }
    );
    cronTasks.push(reviewTask);

    logger.info(`Scheduler: ${group.group} (${group.markets.join('/')}) - predict=${group.predictionCronUTC}, review=${group.reviewCronUTC} (UTC)`);
  }

  logger.info('Scheduler initialized with market-aware cron jobs');
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  cronTasks.forEach(t => t.stop());
  cronTasks.length = 0;
  logger.info('Scheduler stopped');
}
