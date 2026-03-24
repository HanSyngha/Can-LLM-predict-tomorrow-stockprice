/**
 * OpenAI-compatible LLM Chat Completions Client.
 *
 * Uses axios with 3 retries and exponential backoff.
 * Provider-aware request building (conditional tool_choice, parallel_tool_calls).
 * ContextLengthError detection.
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  Message,
  ToolDefinition,
  LLMResponse,
  LLMClientInterface,
} from '../types/index.js';
import type { ProviderConfig, LLMProvider } from '../types/provider.js';
import { getProviderConfig } from '../types/provider.js';
import { logger } from '../utils/logger.js';

export class ContextLengthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextLengthError';
  }
}

export interface LLMClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: LLMProvider;
  providerConfig?: ProviderConfig;
  extraHeaders?: Record<string, string>;
}

export class LLMClient implements LLMClientInterface {
  private client: AxiosInstance;
  private model: string;
  private providerConfig: ProviderConfig;
  private maxRetries = 5;
  private maxRateLimitRetries = 8;

  constructor(config: LLMClientConfig) {
    this.model = config.model;
    this.providerConfig = config.providerConfig ?? getProviderConfig(config.provider);

    const baseURL = config.baseUrl.replace(/\/+$/, '');

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        ...(config.extraHeaders ?? {}),
      },
      timeout: 120_000,
    });
  }

  async chatCompletion(options: {
    messages: Message[];
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | 'required';
    temperature?: number;
  }): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;

      // Provider-aware parallel_tool_calls
      if (!this.providerConfig.supportsParallelToolCalls) {
        // Omit parallel_tool_calls entirely for unsupported providers
      } else {
        body.parallel_tool_calls = false; // We enforce single tool per turn
      }

      // Provider-aware tool_choice
      if (options.tool_choice) {
        if (options.tool_choice === 'required' && !this.providerConfig.supportsToolChoiceRequired) {
          // Fallback to 'auto' if 'required' not supported
          if (this.providerConfig.supportsToolChoice) {
            body.tool_choice = 'auto';
          }
        } else if (options.tool_choice !== 'auto' || this.providerConfig.supportsToolChoice) {
          if (this.providerConfig.supportsToolChoice) {
            body.tool_choice = options.tool_choice;
          }
        }
      }
    }

    let lastError: Error | null = null;
    let rateLimitRetries = 0;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.post('/chat/completions', body);
        return response.data as LLMResponse;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for context length error
        if (this.isContextLengthError(error)) {
          throw new ContextLengthError(
            `Context length exceeded: ${lastError.message}`
          );
        }

        const isRateLimit = axios.isAxiosError(error) && error.response?.status === 429;

        // Rate limit: special long-wait retry (up to 8 additional attempts)
        if (isRateLimit && rateLimitRetries < this.maxRateLimitRetries) {
          rateLimitRetries++;
          // Progressive wait: 10s, 20s, 30s, 40s, 50s, 60s, 60s, 60s
          const waitSec = Math.min(10 * rateLimitRetries, 60);
          logger.warn(`Rate limited (429). Waiting ${waitSec}s before retry ${rateLimitRetries}/${this.maxRateLimitRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
          attempt--; // Don't count rate limit retries against normal retries
          continue;
        }

        // Check for non-retryable errors (4xx except 429)
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          if (status >= 400 && status < 500 && status !== 429) {
            throw lastError;
          }
        }

        // Retry with exponential backoff for server errors
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.warn(`LLM request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('LLM request failed after all retries');
  }

  private isContextLengthError(error: unknown): boolean {
    if (!axios.isAxiosError(error) || !error.response) return false;

    const status = error.response.status;
    const data = error.response.data as Record<string, unknown> | undefined;
    const message = (
      (data?.error as Record<string, unknown>)?.message ??
      data?.message ??
      ''
    ) as string;
    const msgLower = message.toLowerCase();

    // Common context length error patterns
    if (status === 400 || status === 413) {
      if (
        msgLower.includes('context length') ||
        msgLower.includes('context_length') ||
        msgLower.includes('maximum context') ||
        msgLower.includes('token limit') ||
        msgLower.includes('too many tokens') ||
        msgLower.includes('max_tokens') ||
        msgLower.includes('input is too long') ||
        msgLower.includes('request too large')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple connectivity test. Returns true if the API responds.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.chatCompletion({
        messages: [{ role: 'user', content: 'Say "ok".' }],
        temperature: 0,
      });
      if (response.choices?.[0]?.message) {
        return { success: true };
      }
      return { success: false, error: 'No response from LLM' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
