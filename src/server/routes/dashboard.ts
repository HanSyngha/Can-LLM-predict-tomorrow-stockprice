/**
 * Dashboard Routes.
 *
 * GET /api/dashboard/summary - Overall dashboard summary (includes per-LLM accuracy)
 * GET /api/dashboard/accuracy-history - Cumulative accuracy over time
 * GET /api/dashboard/stock-summary - Per-stock summary cards
 * GET /api/dashboard/llm-comparison - Per-LLM comparison data
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';
import { getSchedulerStatus, runReviewCycle } from '../services/scheduler.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/dashboard/summary - Overall stats (includes per-LLM)
  app.get('/api/dashboard/summary', async () => {
    return dal.getDashboardSummary();
  });

  // GET /api/dashboard/accuracy-history - Accuracy trend data
  app.get('/api/dashboard/accuracy-history', async (request) => {
    const { limit, llm_id } = request.query as { limit?: string; llm_id?: string };
    const numLimit = limit ? parseInt(limit, 10) : undefined;
    return dal.getAccuracyHistory(numLimit, llm_id);
  });

  // GET /api/dashboard/stock-summary - Per-stock summary
  app.get('/api/dashboard/stock-summary', async () => {
    return dal.getStockSummaries();
  });

  // GET /api/dashboard/status - Real-time scheduler status
  app.get('/api/dashboard/status', async () => {
    return getSchedulerStatus();
  });

  // POST /api/dashboard/trigger-review - Manually trigger review cycle
  app.post('/api/dashboard/trigger-review', async (request, reply) => {
    const { markets } = (request.query || {}) as { markets?: string };
    const marketFilter = markets ? markets.split(',') : undefined;
    runReviewCycle(marketFilter).catch(err => {
      console.error('Manual review cycle failed', err);
    });
    return { success: true, message: 'Review cycle triggered' };
  });

  // GET /api/dashboard/llm-comparison - Per-LLM comparison data
  app.get('/api/dashboard/llm-comparison', async () => {
    const llmConfigs = dal.getActiveLLMConfigs();
    return llmConfigs.map(config => {
      const stats = dal.getAccuracyStats(undefined, config.id);
      return {
        llmId: config.id,
        llmName: config.name,
        model: config.model,
        isActive: config.isActive,
        accuracy: stats.rate,
        totalPredictions: stats.total,
        totalCorrect: stats.correct,
        totalIncorrect: stats.incorrect,
        unable: stats.unable,
      };
    });
  });
}
