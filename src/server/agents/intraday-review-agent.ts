/**
 * Intraday Review Agent.
 *
 * Runs every hourly cycle (grade → review → predict).
 * Analyzes graded intraday predictions, writes/updates intraday notes.
 * Defines 2 tools (edit_note, complete).
 * Max 10 iterations.
 * Notes modified in real-time via DB (intraday_notes table).
 * Per-LLM note editing.
 */

import type { Stock, IntradayPrediction, Message, ToolHandler, LLMConfig } from '../types/index.js';
import { createLLMClient, createLLMClientForConfig } from '../llm/providers.js';
import { runIterationEngine } from '../llm/iteration-engine.js';
import { buildIntradayReviewSystemPrompt } from '../prompts/intraday-review.js';
import * as dal from '../db/dal.js';
import { autoTranslateIntradayNote } from '../services/auto-translate.js';
import { logger } from '../utils/logger.js';

/**
 * Run the intraday review agent for a stock's today's intraday predictions.
 * If llmConfig is provided, uses that specific LLM and edits intraday notes for that llm_id.
 */
export async function runIntradayReviewAgent(
  stock: Stock,
  todayPredictions: IntradayPrediction[],
  llmConfig?: LLMConfig
): Promise<void> {
  const llmId = llmConfig?.id ?? 'default';
  const llmLabel = llmConfig ? `${llmConfig.name}(${llmConfig.id})` : 'default';
  const date = todayPredictions.length > 0 ? todayPredictions[0]!.prediction_date : new Date().toISOString().slice(0, 10);

  logger.info(`Intraday review agent starting for ${stock.ticker} on ${date} (${todayPredictions.length} predictions) [LLM: ${llmLabel}]`);

  if (todayPredictions.length === 0) {
    logger.info(`No intraday predictions to review for ${stock.ticker} on ${date} [LLM: ${llmLabel}]`);
    return;
  }

  // Build prompt context (per-LLM intraday notes)
  const notes = dal.getAllIntradayNotes(llmId);
  const accuracy = dal.getIntradayAccuracyStats(stock.ticker, llmId);

  const systemPrompt = buildIntradayReviewSystemPrompt({
    stock,
    todayPredictions,
    notes,
    accuracy,
    date,
  });

  // Define tools
  const tools: ToolHandler[] = [
    // 1. edit_note (per-LLM, intraday_notes table)
    {
      definition: {
        type: 'function',
        function: {
          name: 'edit_note',
          description:
            'Write or overwrite an intraday note in the specified slot (1-50). Notes are per-LLM.',
          parameters: {
            type: 'object',
            properties: {
              slot_number: {
                type: 'number',
                description: 'Slot number (1-50)',
              },
              content: {
                type: 'string',
                description: 'Note content to write',
              },
            },
            required: ['slot_number', 'content'],
          },
        },
      },
      execute: async (args) => {
        const slotNumber = args.slot_number as number;
        const content = args.content as string;

        if (slotNumber < 1 || slotNumber > 50) {
          return {
            success: false,
            error: 'Slot number must be between 1 and 50.',
          };
        }

        if (!content || !content.trim()) {
          return {
            success: false,
            error: 'Note content cannot be empty.',
          };
        }

        // Write to DB immediately (per-LLM, intraday_notes table)
        const updatedBy = `INTRADAY_REVIEW:${stock.ticker}:${date}`;
        dal.updateIntradayNote(slotNumber, content.trim(), updatedBy, llmId);

        // Auto-translate note to Korean
        autoTranslateIntradayNote(llmId, slotNumber, content.trim()).catch(err => {
          logger.warn(`Intraday note translation failed for slot ${slotNumber}`, err);
        });

        logger.info(`Intraday note ${slotNumber} updated by review of ${stock.ticker} [LLM: ${llmLabel}]`);

        return {
          success: true,
          result: `Intraday note #${slotNumber} updated successfully.`,
        };
      },
    },

    // 2. complete (terminal)
    {
      definition: {
        type: 'function',
        function: {
          name: 'complete',
          description: 'Call this when you have finished reviewing and editing intraday notes.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      execute: async () => {
        return { success: true, result: 'Intraday review completed.' };
      },
    },
  ];

  // Create LLM client - use specific config if provided
  const llmClient = llmConfig
    ? createLLMClientForConfig(llmConfig)
    : createLLMClient(false);

  // rebuildMessages callback - always show latest intraday note state (per-LLM)
  const rebuildMessages = (toolHistory: Message[]): Message[] => {
    // Re-read intraday notes to get latest state (may have been modified by edit_note)
    const currentNotes = dal.getAllIntradayNotes(llmId);
    const currentAccuracy = dal.getIntradayAccuracyStats(stock.ticker, llmId);
    const updatedPrompt = buildIntradayReviewSystemPrompt({
      stock,
      todayPredictions,
      notes: currentNotes,
      accuracy: currentAccuracy,
      date,
    });

    return [
      { role: 'system', content: updatedPrompt },
      {
        role: 'user',
        content: 'Analyze today\'s intraday prediction results above and write lessons learned in the intraday notes. Write all notes in ENGLISH for consistency. Call the complete tool when done.',
      },
      ...toolHistory,
    ];
  };

  // Run iteration engine
  const result = await runIterationEngine({
    llmClient,
    tools,
    terminalTools: ['complete'],
    rebuildMessages,
    maxIterations: 10,
    onIteration: (iteration, toolName) => {
      logger.debug(`IntradayReview[${stock.ticker}][${llmLabel}] iteration ${iteration}: ${toolName}`);
    },
  });

  logger.info(`Intraday review agent completed for ${stock.ticker} [LLM: ${llmLabel}] (${result.iterations} iterations, ${result.toolCallHistory.length} tool calls)`);
}
