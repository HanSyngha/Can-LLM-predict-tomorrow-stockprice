/**
 * Fastify Server Entry Point.
 *
 * Register cors, static (dist/client).
 * Init DB. Register all route files. Init scheduler.
 * Listen on PORT (default 4001).
 * SPA fallback for client-side routing.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

import { initDatabase } from './db/database.js';
import { stockRoutes } from './routes/stocks.js';
import { predictionRoutes } from './routes/predictions.js';
import { noteRoutes } from './routes/notes.js';
import { settingRoutes } from './routes/settings.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { translateRoutes } from './routes/translate.js';
import { initScheduler } from './services/scheduler.js';
import { initIntradayScheduler } from './services/intraday-scheduler.js';
import { intradayRoutes } from './routes/intraday.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const PORT = parseInt(process.env.PORT || '4001', 10);

  // Initialize database
  initDatabase();
  logger.info('Database initialized');

  // Create Fastify instance
  const app = Fastify({
    logger: false,
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register static file serving for client build
  const clientDistPath = join(__dirname, '..', '..', 'dist', 'client');
  const clientSrcPath = join(__dirname, '..', 'client'); // for dev fallback

  if (existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      decorateReply: false,
    });
  }

  // Register API routes
  await app.register(stockRoutes);
  await app.register(predictionRoutes);
  await app.register(noteRoutes);
  await app.register(settingRoutes);
  await app.register(dashboardRoutes);
  await app.register(translateRoutes);
  await app.register(intradayRoutes);

  // SPA fallback: serve index.html for any non-API, non-file routes
  app.setNotFoundHandler(async (request, reply) => {
    // If it's an API route, return 404 JSON
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    // For client-side routes, serve index.html
    const indexPath = join(clientDistPath, 'index.html');
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      return reply.type('text/html').send(html);
    }

    return reply.status(404).send({ error: 'Not Found' });
  });

  // Initialize schedulers
  initScheduler();
  initIntradayScheduler();

  // Start server
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    logger.info(`Server listening on http://0.0.0.0:${PORT}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main', error);
  process.exit(1);
});
