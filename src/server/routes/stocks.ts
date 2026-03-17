/**
 * Stock Routes.
 *
 * GET/POST/DELETE /api/stocks
 * GET /api/stocks/search
 * GET /api/stocks/:ticker
 * GET /api/stocks/:ticker/prices
 * GET /api/stocks/:ticker/accuracy-history
 * POST /api/stocks/:ticker/predict (triggers immediate prediction)
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';
import { searchTicker, ensureRecentPrices } from '../services/stock-api.js';
import { triggerImmediatePrediction } from '../services/scheduler.js';
import { logger } from '../utils/logger.js';

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/stocks - List active stocks
  app.get('/api/stocks', async () => {
    return dal.getActiveStocks();
  });

  // POST /api/stocks - Add a new stock
  app.post('/api/stocks', async (request, reply) => {
    const body = request.body as {
      ticker: string;
      name: string;
      market: string;
      name_ko?: string;
    };

    if (!body.ticker || !body.name || !body.market) {
      return reply.status(400).send({ error: 'Missing required fields: ticker, name, market' });
    }

    // Check if already exists
    const existing = dal.getStockByTicker(body.ticker);
    if (existing) {
      return reply.status(409).send({ error: `Stock ${body.ticker} already exists` });
    }

    const stock = dal.addStock({
      ticker: body.ticker,
      name: body.name,
      name_ko: body.name_ko || null,
      market: body.market,
      api_source: 'YAHOO',
    });

    // Background: fetch prices and run first prediction
    (async () => {
      try {
        await ensureRecentPrices(stock, 35);
        await triggerImmediatePrediction(stock);
      } catch (error) {
        logger.error(`Background tasks failed for new stock ${stock.ticker}`, error);
      }
    })();

    return reply.status(201).send(stock);
  });

  // DELETE /api/stocks/:ticker - Deactivate a stock
  app.delete('/api/stocks/:ticker', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    dal.deactivateStock(ticker);
    return { success: true };
  });

  // GET /api/stocks/search - Search for tickers
  app.get('/api/stocks/search', async (request, reply) => {
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length === 0) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const results = await searchTicker(q);
    return results;
  });

  // GET /api/stocks/:ticker - Get stock detail
  app.get('/api/stocks/:ticker', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const accuracy = dal.getAccuracyStats(ticker);
    const latestPred = dal.getRecentPredictions(ticker, 1);

    return {
      ...stock,
      accuracy,
      lastPrediction: latestPred[0] || null,
    };
  });

  // GET /api/stocks/:ticker/prices - Get price history
  app.get('/api/stocks/:ticker/prices', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { days } = request.query as { days?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const numDays = parseInt(days || '30', 10);
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - numDays * 86400_000).toISOString().slice(0, 10);

    return dal.getPriceRange(ticker, startDate, endDate);
  });

  // GET /api/stocks/:ticker/accuracy-history - Get accuracy trend
  app.get('/api/stocks/:ticker/accuracy-history', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    return dal.getStockAccuracyHistory(ticker);
  });

  // POST /api/stocks/:ticker/predict - Trigger immediate prediction
  app.post('/api/stocks/:ticker/predict', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    // Run prediction in background
    triggerImmediatePrediction(stock).catch(error => {
      logger.error(`Manual prediction trigger failed for ${ticker}`, error);
    });

    return { success: true, message: `Prediction triggered for ${ticker}` };
  });
}
