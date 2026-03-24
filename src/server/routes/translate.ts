/**
 * Translation Routes.
 *
 * POST /api/translate - Translate text using the configured translate LLM
 */

import type { FastifyInstance } from 'fastify';
import * as dal from '../db/dal.js';
import { LLMClient } from '../llm/llm-client.js';
import { getProviderConfig } from '../types/provider.js';
import type { LLMProvider } from '../types/provider.js';
import type { ProxySettings } from '../types/index.js';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

function getProxyHeaders(): Record<string, string> {
  const ps = dal.getSetting<ProxySettings>('proxy_settings');
  if (!ps?.serviceId) return {};
  const headers: Record<string, string> = { 'x-service-id': ps.serviceId };
  if (ps.deptName) headers['x-dept-name'] = ps.deptName;
  return headers;
}

interface TranslateLLMSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

export async function translateRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/translate
  app.post('/api/translate', async (request, reply) => {
    const body = request.body as { text: string; targetLang: 'ko' | 'en' };

    if (!body.text || !body.targetLang) {
      return reply.status(400).send({ error: 'Missing required fields: text, targetLang' });
    }

    // Check if translate_llm is configured, fallback to first active LLM
    let translateConfig = dal.getSetting<TranslateLLMSettings>('translate_llm');
    if (!translateConfig?.model) {
      const configs = dal.getLLMConfigs();
      const first = configs.find(c => c.isActive) || configs[0];
      if (!first) {
        return reply.status(400).send({ error: 'No LLM configured' });
      }
      translateConfig = { provider: first.provider, baseUrl: first.baseUrl, apiKey: first.apiKey, model: first.model };
    }

    // Check cache first
    const sourceHash = hashText(body.text);
    const cached = dal.getCachedTranslation(sourceHash, body.targetLang);
    if (cached) {
      return { translated: cached };
    }

    // Call the LLM for translation
    const langName = body.targetLang === 'ko' ? 'Korean' : 'English';
    const providerConfig = getProviderConfig(translateConfig.provider);

    const client = new LLMClient({
      baseUrl: translateConfig.baseUrl || providerConfig.defaultBaseUrl,
      apiKey: translateConfig.apiKey || '',
      model: translateConfig.model,
      provider: translateConfig.provider as LLMProvider,
      providerConfig,
      extraHeaders: getProxyHeaders(),
    });

    try {
      const response = await client.chatCompletion({
        messages: [
          {
            role: 'user',
            content: `Translate the following text to ${langName}. Return ONLY the translated text, no explanations:\n\n${body.text}`,
          },
        ],
        temperature: 0.3,
      });

      const translated = response.choices?.[0]?.message?.content || '';
      if (!translated) {
        return reply.status(500).send({ error: 'Empty translation response' });
      }

      // Cache the translation
      dal.cacheTranslation(sourceHash, body.targetLang, translated);
      logger.info(`Translation cached: ${sourceHash} -> ${body.targetLang}`);

      return { translated };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Translation failed', msg);
      return reply.status(500).send({ error: `Translation failed: ${msg}` });
    }
  });
}
