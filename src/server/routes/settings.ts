/**
 * Settings Routes.
 *
 * GET /api/settings - Get all settings
 * GET /api/settings/:key - Get a specific setting
 * PUT /api/settings/:key - Update a setting
 * POST /api/settings/test-llm - Test LLM connection
 *
 * Multi-LLM routes:
 * GET /api/settings/llms - Get all LLM configs
 * POST /api/settings/llms - Add LLM config
 * PUT /api/settings/llms/:id - Update LLM config
 * DELETE /api/settings/llms/:id - Delete LLM config
 * POST /api/settings/llms/:id/test - Test LLM connection for specific config
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';
import { LLMClient } from '../llm/llm-client.js';
import { getProviderConfig } from '../types/provider.js';
import type { LLMProvider } from '../types/provider.js';
import type { LLMConfig, ProxySettings } from '../types/index.js';
import { logger } from '../utils/logger.js';

function getProxyHeaders(): Record<string, string> {
  const ps = dal.getSetting<ProxySettings>('proxy_settings');
  if (!ps?.serviceId) return {};
  const headers: Record<string, string> = { 'x-service-id': ps.serviceId };
  if (ps.deptName) headers['x-dept-name'] = ps.deptName;
  return headers;
}

export async function settingRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/settings - Get all settings
  app.get('/api/settings', async () => {
    const all = dal.getAllSettings();
    // Mask sensitive fields
    if (all.llm_provider && typeof all.llm_provider === 'object') {
      const llm = all.llm_provider as Record<string, unknown>;
      if (llm.apiKey && typeof llm.apiKey === 'string') {
        llm.apiKey = llm.apiKey.slice(0, 8) + '...';
      }
      if (llm.searchApiKey && typeof llm.searchApiKey === 'string') {
        llm.searchApiKey = (llm.searchApiKey as string).slice(0, 8) + '...';
      }
    }
    // Mask LLM configs API keys
    if (all.llm_configs && Array.isArray(all.llm_configs)) {
      for (const config of all.llm_configs as Record<string, unknown>[]) {
        if (config.apiKey && typeof config.apiKey === 'string') {
          config.apiKey = config.apiKey.slice(0, 8) + '...';
        }
      }
    }
    return all;
  });

  // GET /api/settings/:key - Get a specific setting
  app.get('/api/settings/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const value = dal.getSetting(key);
    if (value === null) {
      return reply.status(404).send({ error: `Setting "${key}" not found` });
    }
    return { key, value };
  });

  // PUT /api/settings/:key - Update a setting
  app.put('/api/settings/:key', async (request) => {
    const { key } = request.params as { key: string };
    const body = request.body as { value: unknown };

    dal.setSetting(key, body.value);
    logger.info(`Setting updated: ${key}`);

    return { success: true, key };
  });

  // POST /api/settings/test-llm - Test LLM connection
  app.post('/api/settings/test-llm', async (request) => {
    const body = request.body as {
      provider: string;
      baseUrl: string;
      apiKey: string;
      model: string;
    };

    const providerConfig = getProviderConfig(body.provider);

    const client = new LLMClient({
      baseUrl: body.baseUrl || providerConfig.defaultBaseUrl,
      apiKey: body.apiKey,
      model: body.model,
      provider: body.provider as LLMProvider,
      providerConfig,
      extraHeaders: getProxyHeaders(),
    });

    const result = await client.testConnection();
    return result;
  });

  // ======= Multi-LLM Config Routes =======

  // GET /api/settings/llms - Get all LLM configs
  app.get('/api/settings/llms', async () => {
    const configs = dal.getLLMConfigs();
    // Mask API keys in response
    return configs.map(c => ({
      ...c,
      apiKey: c.apiKey ? c.apiKey.slice(0, 8) + '...' : '',
    }));
  });

  // POST /api/settings/llms - Add LLM config
  app.post('/api/settings/llms', async (request, reply) => {
    const body = request.body as LLMConfig;

    if (!body.id || !body.name || !body.model || !body.baseUrl) {
      return reply.status(400).send({ error: 'Missing required fields: id, name, model, baseUrl' });
    }

    try {
      const configs = dal.addLLMConfig({
        id: body.id,
        name: body.name,
        provider: body.provider || 'zai',
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        model: body.model,
        isActive: body.isActive !== false,
      });
      logger.info(`LLM config added: ${body.id}`);
      return configs.map(c => ({
        ...c,
        apiKey: c.apiKey ? c.apiKey.slice(0, 8) + '...' : '',
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.status(400).send({ error: msg });
    }
  });

  // PUT /api/settings/llms/:id - Update LLM config
  app.put('/api/settings/llms/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<LLMConfig>;

    try {
      const configs = dal.updateLLMConfig(id, body);
      logger.info(`LLM config updated: ${id}`);
      return configs.map(c => ({
        ...c,
        apiKey: c.apiKey ? c.apiKey.slice(0, 8) + '...' : '',
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.status(404).send({ error: msg });
    }
  });

  // DELETE /api/settings/llms/:id - Delete LLM config
  app.delete('/api/settings/llms/:id', async (request) => {
    const { id } = request.params as { id: string };
    const configs = dal.deleteLLMConfig(id);
    logger.info(`LLM config deleted: ${id}`);
    return configs.map(c => ({
      ...c,
      apiKey: c.apiKey ? c.apiKey.slice(0, 8) + '...' : '',
    }));
  });

  // POST /api/settings/llms/:id/test - Test specific LLM config connection
  app.post('/api/settings/llms/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };

    const config = dal.getLLMConfig(id);
    if (!config) {
      return reply.status(404).send({ error: `LLM config "${id}" not found` });
    }

    const providerConfig = getProviderConfig(config.provider);

    const client = new LLMClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      provider: config.provider as LLMProvider,
      providerConfig,
      extraHeaders: getProxyHeaders(),
    });

    const result = await client.testConnection();
    return result;
  });
}
