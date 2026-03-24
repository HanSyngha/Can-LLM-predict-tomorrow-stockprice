/**
 * Auto-translate service.
 * Translates prediction reasoning and search reports to Korean after prediction completes.
 */

import { LLMClient } from '../llm/llm-client.js';
import { createLLMClientForConfig } from '../llm/providers.js';
import { getProviderConfig } from '../types/provider.js';
import type { LLMProvider } from '../types/provider.js';
import type { ProxySettings } from '../types/index.js';
import * as dal from '../db/dal.js';
import { getDb } from '../db/database.js';
import { logger } from '../utils/logger.js';

interface TranslateLLMSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getProxyHeaders(): Record<string, string> {
  const ps = dal.getSetting<ProxySettings>('proxy_settings');
  if (!ps?.serviceId) return {};
  const headers: Record<string, string> = { 'x-service-id': ps.serviceId };
  if (ps.deptName) headers['x-dept-name'] = ps.deptName;
  return headers;
}

function getTranslateClient(): LLMClient | null {
  // 1) translate_llm 설정이 있으면 그걸 사용
  const config = dal.getSetting<TranslateLLMSettings>('translate_llm');
  if (config?.model) {
    const providerConfig = getProviderConfig(config.provider || 'other');
    return new LLMClient({
      baseUrl: config.baseUrl || providerConfig.defaultBaseUrl,
      apiKey: config.apiKey || '',
      model: config.model,
      provider: (config.provider || 'other') as LLMProvider,
      providerConfig,
      extraHeaders: getProxyHeaders(),
    });
  }

  // 2) 없으면 첫 번째 활성 LLM config를 번역용으로 사용 (사내망 fallback)
  const llmConfigs = dal.getLLMConfigs();
  const first = llmConfigs.find(c => c.isActive) || llmConfigs[0];
  if (first) {
    logger.info(`Translate LLM not configured, falling back to first LLM: ${first.id}`);
    return createLLMClientForConfig(first);
  }

  return null;
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

/**
 * Auto-translate a note's content to Korean.
 */
export async function autoTranslateNote(llmId: string, slotNumber: number, content: string): Promise<void> {
  try {
    const client = getTranslateClient();
    if (!client) return;

    const translated = await translateText(client, content);
    if (translated) {
      getDb().prepare(
        'UPDATE notes SET content_ko = ? WHERE llm_id = ? AND slot_number = ?'
      ).run(translated, llmId, slotNumber);
      logger.info(`Auto-translated note slot ${slotNumber} [${llmId}]`);
    }
  } catch (err) {
    logger.warn(`Note translation failed for slot ${slotNumber}`, err);
  }
}

/**
 * Auto-translate an intraday prediction's reasoning and search reports to Korean.
 */
export async function autoTranslateIntradayPrediction(ticker: string, date: string, hour: number, minute: number, llmId: string): Promise<void> {
  try {
    const client = getTranslateClient();
    if (!client) return;

    const pred = getDb().prepare(
      'SELECT id, reasoning, search_reports FROM intraday_predictions WHERE ticker = ? AND prediction_date = ? AND prediction_hour = ? AND prediction_minute = ? AND llm_id = ?'
    ).get(ticker, date, hour, minute, llmId) as
      { id: number; reasoning: string | null; search_reports: string | null } | undefined;
    if (!pred) return;

    let reasoningKo: string | null = null;
    let searchReportsKo: string | null = null;

    if (pred.reasoning) {
      try {
        reasoningKo = await translateText(client, pred.reasoning);
      } catch (err) {
        logger.warn(`Auto-translate intraday reasoning failed for ${ticker}:${hour}:${minute}`, err);
      }
    }

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
        logger.warn(`Auto-translate intraday search reports failed for ${ticker}:${hour}:${minute}`, err);
      }
    }

    if (reasoningKo || searchReportsKo) {
      dal.updateIntradayPredictionTranslations(pred.id, reasoningKo, searchReportsKo);
      logger.info(`Auto-translated intraday prediction ${ticker} slot ${hour}:${minute}`);
    }
  } catch (err) {
    logger.warn(`Auto-translate intraday failed for ${ticker}:${hour}:${minute}`, err);
  }
}

/**
 * Auto-translate an intraday note's content to Korean.
 */
export async function autoTranslateIntradayNote(llmId: string, slotNumber: number, content: string): Promise<void> {
  try {
    const client = getTranslateClient();
    if (!client) return;

    const translated = await translateText(client, content);
    if (translated) {
      getDb().prepare(
        'UPDATE intraday_notes SET content_ko = ? WHERE llm_id = ? AND slot_number = ?'
      ).run(translated, llmId, slotNumber);
      logger.info(`Auto-translated intraday note slot ${slotNumber} [${llmId}]`);
    }
  } catch (err) {
    logger.warn(`Intraday note translation failed for slot ${slotNumber}`, err);
  }
}
