/**
 * Intraday Prediction Agent.
 *
 * Gathers context (hourly prices, intraday predictions, intraday notes, accuracy).
 * Defines 4 tools (search, predict, read_notes, search_history).
 * Creates rebuildMessages callback.
 * Runs iteration engine.
 * Saves intraday prediction to DB.
 */

import type { Stock, Message, ToolHandler, LLMConfig, IntradaySlot, IntradayPrediction, Note, AccuracyStats } from '../types/index.js';
import { createLLMClient, createLLMClientForConfig } from '../llm/providers.js';
import { runIterationEngine } from '../llm/iteration-engine.js';
import { buildIntradayPredictionSystemPrompt } from '../prompts/intraday-prediction.js';
import type { IntradayPredictionPromptContext } from '../prompts/intraday-prediction.js';
import { runSearchAgent } from './search/search-agent.js';
import * as dal from '../db/dal.js';
import { fetchCurrentPrice, ensureIntradayPrices } from '../services/stock-api.js';
import { autoTranslateIntradayPrediction } from '../services/auto-translate.js';
import { logger } from '../utils/logger.js';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Run the intraday prediction agent for a given stock and time slot.
 * If llmConfig is provided, uses that specific LLM and saves prediction with its llm_id.
 * Returns the prediction direction and reasoning, or null if prediction already exists.
 */
export async function runIntradayPredictionAgent(
  stock: Stock,
  slot: IntradaySlot,
  date: string,
  llmConfig?: LLMConfig
): Promise<{ direction: string; reasoning: string } | null> {
  const llmId = llmConfig?.id ?? 'default';
  const llmLabel = llmConfig ? `${llmConfig.name}(${llmConfig.id})` : 'default';
  const predictionTime = `${pad(slot.predictAtHour)}:${pad(slot.predictAtMinute)}`;
  const targetTime = `${pad(slot.targetHour)}:${pad(slot.targetMinute)}`;

  logger.info(`Intraday prediction agent starting for ${stock.ticker} slot ${predictionTime}->${targetTime} [LLM: ${llmLabel}]`);

  // Check if prediction already exists for this slot
  const existing = dal.getIntradayPrediction(
    stock.ticker, date, slot.predictAtHour, slot.predictAtMinute, llmId
  );
  if (existing) {
    logger.info(`Intraday prediction already exists for ${stock.ticker} slot ${predictionTime} on ${date} [LLM: ${llmLabel}]`);
    return { direction: existing.direction, reasoning: existing.reasoning || '' };
  }

  // Ensure intraday prices are fetched
  await ensureIntradayPrices(stock);

  // Get filtered hourly prices (last 100 entries)
  const hourlyPrices = dal.getFilteredIntradayPrices(stock.ticker, stock.market, 100);

  // Get current price
  const currentQuote = await fetchCurrentPrice(stock);
  const currentPrice = currentQuote?.price ?? null;
  const referencePrice = currentPrice;

  // Get today's earlier intraday predictions
  const todayPredictions = dal.getIntradayPredictionsForDate(stock.ticker, date, llmId);

  // Get intraday notes and accuracy stats
  const notes = dal.getAllIntradayNotes(llmId);
  const accuracy = dal.getIntradayAccuracyStats(stock.ticker, llmId);

  // Get flat threshold from settings
  const generalSettings = dal.getSetting<{ intradayFlatThreshold?: number }>('general');
  const flatThreshold = generalSettings?.intradayFlatThreshold ?? 0.15;

  const isFirstPrediction = todayPredictions.length === 0 && (accuracy.total === 0);

  const promptContext: IntradayPredictionPromptContext = {
    stock,
    currentPrice,
    accuracy: isFirstPrediction ? null : accuracy,
    recentIntradayPredictions: todayPredictions,
    hourlyPrices,
    notes,
    isFirstPrediction,
    referencePrice,
    targetTime,
    predictionTime,
    targetDate: date,
    flatThreshold,
  };

  const systemPrompt = buildIntradayPredictionSystemPrompt(promptContext);

  // Track search queries and reports
  const searchQueries: string[] = [];
  const searchReports: string[] = [];

  // Define tools
  const tools: ToolHandler[] = [
    // 1. search
    {
      definition: {
        type: 'function',
        function: {
          name: 'search',
          description:
            'Search the web for real-time information about the stock. Uses a browser-based research agent. Provide a search query and a specific question you want answered.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "삼성전자 실시간 뉴스 2026")',
              },
              question: {
                type: 'string',
                description:
                  'Specific question to answer (e.g., "삼성전자에 영향을 줄 오늘 뉴스가 있는가?")',
              },
            },
            required: ['query', 'question'],
          },
        },
      },
      execute: async (args) => {
        const query = args.query as string;
        const question = args.question as string;

        searchQueries.push(query);

        try {
          const result = await runSearchAgent({ query, question });
          searchReports.push(result.report);
          return {
            success: true,
            result: result.report,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: `Search failed: ${errorMsg}`,
          };
        }
      },
    },

    // 2. predict (terminal)
    {
      definition: {
        type: 'function',
        function: {
          name: 'predict',
          description:
            'Submit your final intraday prediction. This ends the agent session. Direction must be UP, DOWN, or FLAT.',
          parameters: {
            type: 'object',
            properties: {
              direction: {
                type: 'string',
                description: 'Predicted direction: "UP", "DOWN", or "FLAT"',
              },
              reasoning: {
                type: 'string',
                description:
                  'Detailed reasoning for your prediction. Include key short-term factors that led to this decision.',
              },
            },
            required: ['direction', 'reasoning'],
          },
        },
      },
      execute: async (args) => {
        return {
          success: true,
          result: `Prediction submitted: ${args.direction}`,
        };
      },
    },

    // 3. read_notes
    {
      definition: {
        type: 'function',
        function: {
          name: 'read_notes',
          description:
            'Read all current intraday notes (slots 1-50). Shows non-empty notes only.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      execute: async () => {
        const currentNotes = dal.getNonEmptyIntradayNotes(llmId);
        if (currentNotes.length === 0) {
          return { success: true, result: 'No intraday notes written yet.' };
        }
        const text = currentNotes
          .map(n => `[${n.slot_number}] ${n.content}`)
          .join('\n');
        return { success: true, result: text };
      },
    },

    // 4. search_history
    {
      definition: {
        type: 'function',
        function: {
          name: 'search_history',
          description:
            'Search past intraday prediction records for this stock. Shows recent intraday predictions with their accuracy.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search keyword (optional)',
              },
            },
          },
        },
      },
      execute: async () => {
        const preds = dal.getIntradayPredictionsForDate(stock.ticker, date, llmId);
        if (preds.length === 0) {
          return { success: true, result: 'No intraday prediction history for this stock today.' };
        }
        const lines = preds.map(p => {
          const correctStr =
            p.is_correct === 1 ? 'Correct' :
            p.is_correct === 0 ? 'Incorrect' : 'Pending';
          const timeSlot = `${pad(p.prediction_hour)}:${pad(p.prediction_minute)}->${pad(p.target_hour)}:${pad(p.target_minute)}`;
          return `${timeSlot}: ${p.direction} (${correctStr}) - ${p.reasoning?.slice(0, 100) || 'N/A'}`;
        });
        return { success: true, result: lines.join('\n') };
      },
    },
  ];

  // Create LLM client - use specific config if provided
  const llmClient = llmConfig
    ? createLLMClientForConfig(llmConfig)
    : createLLMClient(false);

  // rebuildMessages callback
  const rebuildMessages = (toolHistory: Message[]): Message[] => {
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `오늘 날짜: ${date}\n예측 시간: ${predictionTime}\n목표 시간: ${targetTime}\n기준가 (현재가): ${referencePrice != null ? referencePrice : 'N/A'}\n\n위 종목에 대해 ${targetTime}의 가격 방향을 예측하라. 기준가 대비 가격의 방향(UP/DOWN/FLAT)을 예측하라. search tool로 실시간 뉴스와 정보를 조사하고, 충분한 근거가 모이면 predict tool을 호출하라.`,
      },
      ...toolHistory,
    ];
  };

  // Run iteration engine
  const result = await runIterationEngine({
    llmClient,
    tools,
    terminalTools: ['predict'],
    rebuildMessages,
    maxIterations: 20,
    onIteration: (iteration, toolName) => {
      logger.debug(`IntradayPrediction[${stock.ticker}][${llmLabel}] slot ${predictionTime} iteration ${iteration}: ${toolName}`);
    },
  });

  // Extract prediction result
  let direction: 'UP' | 'DOWN' | 'FLAT' | 'UNABLE' = 'UNABLE';
  let reasoning: string | null = null;

  if (result.terminalToolName === 'predict' && result.terminalToolArgs) {
    const rawDir = (result.terminalToolArgs.direction as string || '').toUpperCase();
    if (['UP', 'DOWN', 'FLAT'].includes(rawDir)) {
      direction = rawDir as 'UP' | 'DOWN' | 'FLAT';
    }
    reasoning = (result.terminalToolArgs.reasoning as string) || null;
  }

  // Save prediction to DB
  dal.createIntradayPrediction({
    llm_id: llmId,
    ticker: stock.ticker,
    prediction_date: date,
    prediction_hour: slot.predictAtHour,
    prediction_minute: slot.predictAtMinute,
    target_hour: slot.targetHour,
    target_minute: slot.targetMinute,
    direction,
    reference_price: referencePrice,
    reasoning,
    search_queries: JSON.stringify(searchQueries),
    search_reports: JSON.stringify(searchReports),
    tool_call_history: JSON.stringify(result.toolCallHistory),
  });

  logger.info(`Intraday prediction saved for ${stock.ticker} slot ${predictionTime}->${targetTime} [LLM: ${llmLabel}]: ${direction} (${result.iterations} iterations)`);

  // Auto-translate to Korean (fire-and-forget, don't block next prediction)
  autoTranslateIntradayPrediction(stock.ticker, date, slot.predictAtHour, slot.predictAtMinute, llmId).catch(err => {
    logger.warn(`Auto-translate failed for intraday prediction ${stock.ticker} slot ${predictionTime}`, err);
  });

  return { direction, reasoning: reasoning || '' };
}
