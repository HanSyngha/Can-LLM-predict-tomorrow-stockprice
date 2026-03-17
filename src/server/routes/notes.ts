/**
 * Notes Routes.
 *
 * GET /api/notes - Read all notes (read-only, optional llm_id filter)
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';

export async function noteRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/notes - Get all 50 notes (optional llm_id query param)
  app.get('/api/notes', async (request) => {
    const { llm_id } = request.query as { llm_id?: string };
    return dal.getAllNotes(llm_id || 'default');
  });
}
