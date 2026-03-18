/**
 * Prediction Agent.
 *
 * Gathers context (prices, predictions, notes, accuracy).
 * Defines 4 tools (search, predict, read_notes, search_history).
 * Creates rebuildMessages callback.
 * Runs iteration engine.
 * Saves prediction to DB.
 */

import type { Stock, Message, ToolHandler, Prediction, LLMConfig } from '../types/index.js';
import { createLLMClient, createLLMClientForConfig } from '../llm/providers.js';
import { runIterationEngine } from '../llm/iteration-engine.js';
import { buildPredictionSystemPrompt } from '../prompts/prediction.js';
import type { PredictionPromptContext } from '../prompts/prediction.js';
import { runSearchAgent } from './search/search-agent.js';
import * as dal from '../db/dal.js';
import { ensureRecentPrices, fetchCurrentPrice } from '../services/stock-api.js';
import { updateSearchIteration } from '../services/scheduler.js';
import { autoTranslatePrediction } from '../services/auto-translate.js';
import { getNextTradingDayForMarket, getLastTradingDayForMarket } from '../utils/market-time.js';
import { logger } from '../utils/logger.js';

/**
 * Run the prediction agent for a given stock.
 * If llmConfig is provided, uses that specific LLM and saves prediction with its llm_id.
 * Returns the created prediction record.
 *
 * Prediction baseline: predict the NEXT TRADING DAY's closing price direction
 * relative to the LAST available closing price.
 */
export async function runPredictionAgent(stock: Stock, llmConfig?: LLMConfig): Promise<Prediction> {
  const llmId = llmConfig?.id ?? 'default';
  const llmLabel = llmConfig ? `${llmConfig.name}(${llmConfig.id})` : 'default';
  logger.info(`Prediction agent starting for ${stock.ticker} (${stock.name}) [LLM: ${llmLabel}]`);

  // Calculate prediction target: next trading day (skips weekends)
  const predictionDate = getNextTradingDayForMarket(stock.market);
  // Calculate last trading day for reference price
  const lastTradingDay = getLastTradingDayForMarket(stock.market);

  // Check if already predicted today (per-LLM)
  const existing = dal.getPrediction(stock.ticker, predictionDate, llmId);
  if (existing) {
    logger.info(`Prediction already exists for ${stock.ticker} on ${predictionDate} [LLM: ${llmLabel}]`);
    return existing;
  }

  // Gather context
  await ensureRecentPrices(stock, 35);

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 35 * 86400_000).toISOString().slice(0, 10);

  const recentPrices = dal.getPriceRange(stock.ticker, startDate, endDate);
  const recentPredictions = dal.getRecentPredictions(stock.ticker, 30, llmId);
  const notes = dal.getNonEmptyNotes(llmId);
  const accuracy = dal.getAccuracyStats(stock.ticker, llmId);

  const currentQuote = await fetchCurrentPrice(stock);
  const currentPrice = currentQuote?.price ?? (
    recentPrices.length > 0
      ? recentPrices[recentPrices.length - 1]!.close_price
      : null
  );

  // Find the most recent closing price in DB (the reference/baseline price)
  // Sort prices descending and find the most recent one on or before lastTradingDay
  const sortedPrices = [...recentPrices].sort((a, b) => b.date.localeCompare(a.date));
  const lastCloseEntry = sortedPrices.find(
    p => p.date <= lastTradingDay && p.close_price !== null
  );
  const lastClosePrice = lastCloseEntry?.close_price ?? currentPrice;
  const lastCloseDate = lastCloseEntry?.date ?? lastTradingDay;

  const isFirstPrediction = recentPredictions.length === 0;

  // Fetch market index data for context
  const INDEX_MAP: Record<string, { ticker: string; name: string }> = {
    KOSPI: { ticker: '^KS11', name: 'KOSPI Index' },
    KOSDAQ: { ticker: '^KQ11', name: 'KOSDAQ Index' },
    NASDAQ: { ticker: '^IXIC', name: 'NASDAQ Composite' },
    NYSE: { ticker: '^NYA', name: 'NYSE Composite' },
  };
  const indexInfo = INDEX_MAP[stock.market];
  let indexPrices: import('../types/index.js').StockPrice[] = [];
  if (indexInfo) {
    indexPrices = dal.getPriceRange(indexInfo.ticker, startDate, endDate);
    if (indexPrices.length === 0) {
      // Try fetching index prices if not in DB
      try {
        const indexStock: import('../types/index.js').Stock = {
          id: 0, ticker: indexInfo.ticker, name: indexInfo.name,
          market: stock.market, api_source: 'YAHOO',
          added_at: '', is_active: 0,
        };
        await ensureRecentPrices(indexStock, 35);
        indexPrices = dal.getPriceRange(indexInfo.ticker, startDate, endDate);
      } catch {
        // Index fetch failed, continue without it
      }
    }
  }

  const promptContext: PredictionPromptContext = {
    stock,
    currentPrice,
    accuracy: isFirstPrediction ? null : accuracy,
    recentPredictions,
    recentPrices,
    indexPrices: indexPrices.length > 0 ? indexPrices : undefined,
    indexName: indexInfo?.name,
    notes: dal.getAllNotes(llmId),
    isFirstPrediction,
    lastClosePrice,
    lastCloseDate,
    targetDate: predictionDate,
  };

  const systemPrompt = buildPredictionSystemPrompt(promptContext);

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
            'Search the web for information about the stock. Uses a browser-based research agent. Provide a search query and a specific question you want answered.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "삼성전자 실적 발표 2026")',
              },
              question: {
                type: 'string',
                description:
                  'Specific question to answer (e.g., "삼성전자의 최근 분기 실적은 어떤가?")',
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
            'Submit your final prediction. This ends the agent session. Direction must be UP, DOWN, or FLAT.',
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
                  'Detailed reasoning for your prediction. Include key factors that led to this decision.',
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
            'Read all current notes (slots 1-50). Shows non-empty notes only.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      execute: async () => {
        const currentNotes = dal.getNonEmptyNotes(llmId);
        if (currentNotes.length === 0) {
          return { success: true, result: 'No notes written yet.' };
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
            'Search past prediction records for this stock. Shows recent predictions with their accuracy.',
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
        const preds = dal.getRecentPredictions(stock.ticker, 30, llmId);
        if (preds.length === 0) {
          return { success: true, result: 'No prediction history for this stock.' };
        }
        const lines = preds.map(p => {
          const correctStr =
            p.is_correct === 1 ? 'Correct' :
            p.is_correct === 0 ? 'Incorrect' : 'Pending';
          return `${p.prediction_date}: ${p.direction} (${correctStr}) - ${p.reasoning?.slice(0, 100) || 'N/A'}`;
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
        content: `오늘 날짜: ${new Date().toISOString().slice(0, 10)}\n예측 대상일: ${predictionDate}\n기준가 (마지막 종가): ${lastClosePrice != null ? lastClosePrice : 'N/A'} (${lastCloseDate})\n\n위 종목에 대해 다음 거래일(${predictionDate})의 종가 방향을 예측하라. 기준가 대비 종가의 방향(UP/DOWN/FLAT)을 예측하라. search tool로 최신 뉴스와 정보를 조사하고, 충분한 근거가 모이면 predict tool을 호출하라.`,
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
    maxIterations: 50,
    onIteration: (iteration, toolName) => {
      logger.debug(`Prediction[${stock.ticker}][${llmLabel}] iteration ${iteration}: ${toolName}`);
      if (llmConfig) updateSearchIteration(stock.ticker, llmConfig.id, iteration);
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

  // Save prediction to DB (with llm_id)
  const prediction = dal.createPrediction({
    llm_id: llmId,
    ticker: stock.ticker,
    prediction_date: predictionDate,
    direction,
    reasoning,
    search_queries: JSON.stringify(searchQueries),
    search_reports: JSON.stringify(searchReports),
    tool_call_history: JSON.stringify(result.toolCallHistory),
  });

  logger.info(`Prediction saved for ${stock.ticker} [LLM: ${llmLabel}]: ${direction} (${result.iterations} iterations)`);

  // Auto-translate to Korean (blocking - completes before moving to next LLM)
  try {
    await autoTranslatePrediction(prediction.id);
  } catch (err) {
    logger.warn(`Auto-translate failed for ${stock.ticker}`, err);
  }

  return prediction;
}
