/**
 * LLM Provider re-exports and factory function.
 */

export type { LLMProvider, ProviderConfig } from '../types/provider.js';
export { PROVIDER_CONFIGS, getProviderConfig } from '../types/provider.js';

import { getProviderConfig } from '../types/provider.js';
import type { LLMProvider } from '../types/provider.js';
import type { LLMProviderSettings, LLMConfig } from '../types/index.js';
import { getSetting, getLLMConfig } from '../db/dal.js';
import { LLMClient } from './llm-client.js';
import { logger } from '../utils/logger.js';

/**
 * Create an LLMClient from the DB settings.
 * If `useSearch` is true, prefers the search-specific provider settings.
 */
export function createLLMClient(useSearch = false): LLMClient {
  const settings = getSetting<LLMProviderSettings>('llm_provider');
  if (!settings) {
    throw new Error('LLM provider settings not configured. Go to Settings page to configure.');
  }

  let baseUrl: string;
  let apiKey: string;
  let model: string;
  let providerId: string;

  if (useSearch && settings.searchProvider && settings.searchModel) {
    providerId = settings.searchProvider;
    baseUrl = settings.searchBaseUrl || getProviderConfig(providerId).defaultBaseUrl;
    apiKey = settings.searchApiKey || settings.apiKey;
    model = settings.searchModel;
  } else {
    providerId = settings.provider;
    baseUrl = settings.baseUrl || getProviderConfig(providerId).defaultBaseUrl;
    apiKey = settings.apiKey;
    model = settings.model;
  }

  const providerConfig = getProviderConfig(providerId);

  logger.info(`Creating LLM client: provider=${providerConfig.name}, model=${model}, search=${useSearch}`);

  return new LLMClient({
    baseUrl,
    apiKey,
    model,
    provider: providerId as LLMProvider,
    providerConfig,
  });
}

/**
 * Create an LLMClient for a specific LLM config (multi-LLM support).
 */
export function createLLMClientForConfig(config: LLMConfig): LLMClient {
  const providerConfig = getProviderConfig(config.provider);

  logger.info(`Creating LLM client for config: id=${config.id}, model=${config.model}`);

  return new LLMClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    provider: config.provider as LLMProvider,
    providerConfig,
  });
}

/**
 * Create an LLMClient for a specific LLM ID.
 * Looks up the config from DB settings.
 */
export function createLLMClientById(llmId: string): LLMClient {
  const config = getLLMConfig(llmId);
  if (!config) {
    throw new Error(`LLM config "${llmId}" not found`);
  }
  return createLLMClientForConfig(config);
}
