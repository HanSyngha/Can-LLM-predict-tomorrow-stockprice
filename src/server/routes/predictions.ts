/**
 * Prediction Routes.
 *
 * GET /api/predictions/:ticker - Get predictions with pagination (optional llm_id filter)
 * GET /api/predictions/:ticker/comparison - Get all LLMs' predictions for a specific date
 * GET /api/predictions/:ticker/all-llms - Get recent predictions grouped by date with all LLMs
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';

export async function predictionRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/predictions/:ticker - Get predictions with pagination
  app.get('/api/predictions/:ticker', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { limit, offset, llm_id } = request.query as { limit?: string; offset?: string; llm_id?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const numLimit = Math.min(parseInt(limit || '20', 10), 100);
    const numOffset = parseInt(offset || '0', 10);

    const result = dal.getPredictionsPaginated(ticker, numLimit, numOffset, llm_id);

    return {
      items: result.items,
      total: result.total,
      hasMore: numOffset + numLimit < result.total,
    };
  });

  // GET /api/predictions/:ticker/comparison?date=YYYY-MM-DD
  app.get('/api/predictions/:ticker/comparison', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { date } = request.query as { date?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    if (!date) {
      return reply.status(400).send({ error: 'date query parameter is required' });
    }

    return dal.getPredictionComparison(ticker, date);
  });

  // GET /api/predictions/:ticker/all-llms?limit=30
  app.get('/api/predictions/:ticker/all-llms', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { limit } = request.query as { limit?: string };

    const stock = dal.getStockByTicker(ticker);
    if (!stock) {
      return reply.status(404).send({ error: `Stock ${ticker} not found` });
    }

    const numLimit = Math.min(parseInt(limit || '30', 10), 100);
    return dal.getAllLLMsPredictions(ticker, numLimit);
  });
}
