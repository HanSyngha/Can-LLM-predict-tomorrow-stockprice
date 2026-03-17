/**
 * Auto-translate service.
 * Translates prediction reasoning and search reports to Korean after prediction completes.
 */

import { LLMClient } from '../llm/llm-client.js';
import { getProviderConfig } from '../types/provider.js';
import type { LLMProvider } from '../types/provider.js';
import * as dal from '../db/dal.js';
import { getDb } from '../db/database.js';
import { logger } from '../utils/logger.js';

interface TranslateLLMSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getTranslateClient(): LLMClient | null {
  const config = dal.getSetting<TranslateLLMSettings>('translate_llm');
  if (!config || !config.apiKey || !config.model) return null;

  const providerConfig = getProviderConfig(config.provider || 'other');
  return new LLMClient({
    baseUrl: config.baseUrl || providerConfig.defaultBaseUrl,
    apiKey: config.apiKey,
    model: config.model,
    provider: (config.provider || 'other') as LLMProvider,
    providerConfig,
  });
}

async function translateText(client: LLMClient, text: string): Promise<string> {
  const response = await client.chatCompletion({
    messages: [
      {
        role: 'user',
        content: `Translate the following English text to Korean. Return ONLY the translated text, preserving all formatting (markdown, lists, numbers). Do not add explanations:\n\n${text}`,
      },
    ],
    temperature: 0.3,
  });
  return response.choices?.[0]?.message?.content || '';
}

/**
 * Auto-translate a prediction's reasoning and search reports to Korean.
 * Called after prediction completes. Runs in background, doesn't block.
 */
export async function autoTranslatePrediction(predictionId: number): Promise<void> {
  try {
    const client = getTranslateClient();
    if (!client) {
      logger.debug('Auto-translate skipped: no translate LLM configured');
      return;
    }

    const pred = getDb().prepare('SELECT id, reasoning, search_reports FROM predictions WHERE id = ?').get(predictionId) as
      { id: number; reasoning: string | null; search_reports: string | null } | undefined;
    if (!pred) return;

    let reasoningKo: string | null = null;
    let searchReportsKo: string | null = null;

    // Translate reasoning
    if (pred.reasoning) {
      try {
        reasoningKo = await translateText(client, pred.reasoning);
      } catch (err) {
        logger.warn(`Auto-translate reasoning failed for prediction ${predictionId}`, err);
      }
    }

    // Translate search reports
    if (pred.search_reports) {
      try {
        const reports: string[] = JSON.parse(pred.search_reports);
        const translated: string[] = [];
        for (const report of reports) {
          if (report.trim()) {
            const t = await translateText(client, report);
            translated.push(t || report);
          }
        }
        searchReportsKo = JSON.stringify(translated);
      } catch (err) {
        logger.warn(`Auto-translate search reports failed for prediction ${predictionId}`, err);
      }
    }

    if (reasoningKo || searchReportsKo) {
      dal.updatePredictionTranslations(predictionId, reasoningKo, searchReportsKo);
      logger.info(`Auto-translated prediction ${predictionId}`);
    }
  } catch (err) {
    logger.warn(`Auto-translate failed for prediction ${predictionId}`, err);
  }
}
