/**
 * Intraday Routes.
 *
 * GET  /api/intraday/summary                — Overall intraday stats
 * GET  /api/intraday/today                  — Today's predictions for all stocks
 * GET  /api/intraday/today/:ticker          — Today's predictions for one stock
 * GET  /api/intraday/:ticker/predictions    — Historical intraday predictions (paginated)
 * GET  /api/intraday/:ticker/prices         — Hourly prices (last 100)
 * GET  /api/intraday/accuracy-history       — Intraday accuracy trend
 * POST /api/intraday/trigger                — Manual trigger
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';
import { getLocalDateForMarket } from '../utils/market-time.js';
import { triggerIntradayManual } from '../services/intraday-scheduler.js';
import { logger } from '../utils/logger.js';

export async function intradayRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/intraday/summary
  app.get('/api/intraday/summary', async () => {
    const overallStats = dal.getIntradayAccuracyStats();
    const llmConfigs = dal.getActiveLLMConfigs();

    // Today stats: aggregate across all market dates
    const todayKR = getLocalDateForMarket('KOSPI');
    const todayUS = getLocalDateForMarket('NASDAQ');
    const statsKR = dal.getIntradayTodayStats(todayKR);
    const statsUS = todayUS !== todayKR ? dal.getIntradayTodayStats(todayUS) : { total: 0, correct: 0 };
    const todayStats = { total: statsKR.total + statsUS.total, correct: statsKR.correct + statsUS.correct };

    const llmAccuracies = llmConfigs.map(config => {
      const stats = dal.getIntradayAccuracyStats(undefined, config.id);
      return {
        llmId: config.id,
        llmName: config.name,
        accuracy: stats.rate,
        totalPredictions: stats.total,
        totalCorrect: stats.correct,
      };
    });

    return {
      overallAccuracy: overallStats.rate,
      totalPredictions: overallStats.total,
      totalCorrect: overallStats.correct,
      todayPredictions: todayStats.total,
      todayCorrect: todayStats.correct,
      llmAccuracies,
    };
  });

  // GET /api/intraday/today
  app.get('/api/intraday/today', async () => {
    const stocks = dal.getActiveStocks();

    return stocks.map(stock => {
      const today = getLocalDateForMarket(stock.market);
      const predictions = dal.getIntradayPredictionsForDate(stock.ticker, today);
      return {
        ticker: stock.ticker,
        name: stock.name,
        name_ko: stock.name_ko || null,
        market: stock.market,
        predictions,
      };
    });
  });

  // GET /api/intraday/today/:ticker
  app.get('/api/intraday/today/:ticker', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { llm_id } = request.query as { llm_id?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const today = getLocalDateForMarket(stock.market);
    return dal.getIntradayPredictionsForDate(ticker, today, llm_id);
  });

  // GET /api/intraday/:ticker/predictions
  app.get('/api/intraday/:ticker/predictions', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { limit, offset, llm_id } = request.query as { limit?: string; offset?: string; llm_id?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const numLimit = parseInt(limit || '50', 10);
    const predictions = dal.getRecentIntradayPredictions(ticker, numLimit, llm_id);
    return { items: predictions, total: predictions.length, hasMore: predictions.length === numLimit };
  });

  // GET /api/intraday/:ticker/prices
  app.get('/api/intraday/:ticker/prices', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { limit } = request.query as { limit?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const numLimit = parseInt(limit || '100', 10);
    return dal.getFilteredIntradayPrices(ticker, stock.market, numLimit);
  });

  // GET /api/intraday/accuracy-history
  app.get('/api/intraday/accuracy-history', async (request) => {
    const { limit, llm_id } = request.query as { limit?: string; llm_id?: string };
    const numLimit = limit ? parseInt(limit, 10) : undefined;
    return dal.getIntradayAccuracyHistory(numLimit, llm_id);
  });

  // GET /api/intraday/notes
  app.get('/api/intraday/notes', async (request) => {
    const { llm_id } = request.query as { llm_id?: string };
    return dal.getAllIntradayNotes(llm_id || 'default');
  });

  // POST /api/intraday/trigger
  app.post('/api/intraday/trigger', async (request) => {
    const { markets } = request.body as { markets?: string[] };
    const targetMarkets = markets || ['KOSPI', 'KOSDAQ', 'NASDAQ'];

    logger.info(`Manual intraday trigger for ${targetMarkets.join('/')}`);

    // Run async, don't block the response
    triggerIntradayManual(targetMarkets).catch(error => {
      logger.error('Manual intraday trigger failed', error);
    });

    return { status: 'triggered', markets: targetMarkets };
  });
}
