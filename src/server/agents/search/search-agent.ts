/**
 * Search Agent Entry Point.
 *
 * Injects today's date.
 * Creates search LLM client from search_llm setting or fallback to active LLM config.
 * Ensures browser connected.
 * Creates SubAgent with browser tools.
 * Returns formatted report.
 */

import { LLMClient } from '../../llm/llm-client.js';
import { getProviderConfig } from '../../types/provider.js';
import type { LLMProvider } from '../../types/provider.js';
import * as dal from '../../db/dal.js';
import { browserClient } from './browser-client.js';
import { createBrowserTools } from './browser-tools.js';
import { SEARCH_SYSTEM_PROMPT } from './prompts.js';
import { SearchSubAgent } from './sub-agent.js';
import { logger } from '../../utils/logger.js';

export interface SearchRequest {
  query: string;
  question: string;
}

export interface SearchResult {
  success: boolean;
  report: string;
  iterations: number;
  toolCalls: number;
}

/**
 * Create LLM client for search.
 * Priority: search_llm setting > glm-5-turbo from configs > first active config
 */
function createSearchLLMClient(): LLMClient {
  // 1. Check dedicated search_llm setting
  const searchLlm = dal.getSetting<{ provider: string; baseUrl: string; apiKey: string; model: string }>('search_llm');
  if (searchLlm && searchLlm.baseUrl && searchLlm.apiKey && searchLlm.model) {
    const providerConfig = getProviderConfig(searchLlm.provider || 'other');
    return new LLMClient({
      baseUrl: searchLlm.baseUrl,
      apiKey: searchLlm.apiKey,
      model: searchLlm.model,
      provider: (searchLlm.provider || 'other') as LLMProvider,
      providerConfig,
    });
  }

  // 2. Fallback to glm-5-turbo from LLM configs
  const configs = dal.getActiveLLMConfigs();
  const turbo = configs.find(c => c.model === 'glm-5-turbo');
  const target = turbo || configs[0];

  if (target) {
    const providerConfig = getProviderConfig(target.provider);
    return new LLMClient({
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      model: target.model,
      provider: target.provider as LLMProvider,
      providerConfig,
    });
  }

  throw new Error('No LLM configured for search. Add LLM configs in Settings.');
}

/**
 * Run the search sub-agent to research a query.
 */
export async function runSearchAgent(request: SearchRequest): Promise<SearchResult> {
  logger.info('Search agent starting', { query: request.query });

  try {
    const llmClient = createSearchLLMClient();

    // Ensure browser is connected.
    // Browser is a singleton and stays alive for reuse across searches.
    // It is not closed after each search to avoid cold-start latency.
    await browserClient.ensureConnected();

    // Create browser tools
    const tools = createBrowserTools();

    // Create sub-agent
    const subAgent = new SearchSubAgent(
      llmClient,
      tools,
      SEARCH_SYSTEM_PROMPT,
      {
        maxIterations: 50,
        temperature: 0.3,
      }
    );

    // Build instruction with context
    const today = new Date().toISOString().slice(0, 10);
    const instruction = `[Today's Date: ${today}]

Search Query: ${request.query}
Question: ${request.question}

Research the above query thoroughly and provide a comprehensive report with key findings, numbers, and source citations.`;

    // Run sub-agent
    const result = await subAgent.run(instruction);

    logger.info('Search agent completed', {
      success: result.success,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
    });

    return {
      success: result.success,
      report: result.report,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Search agent failed', error);
    return {
      success: false,
      report: `Search failed: ${errorMsg}`,
      iterations: 0,
      toolCalls: 0,
    };
  }
}
