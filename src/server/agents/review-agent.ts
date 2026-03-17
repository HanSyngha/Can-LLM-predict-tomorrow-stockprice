/**
 * Review Agent.
 *
 * Defines 2 tools (edit_note, complete).
 * Max 15 iterations.
 * Notes modified in real-time via DB.
 * Per-LLM note editing.
 */

import type { Stock, Prediction, Message, ToolHandler, LLMConfig } from '../types/index.js';
import { createLLMClient, createLLMClientForConfig } from '../llm/providers.js';
import { runIterationEngine } from '../llm/iteration-engine.js';
import { buildReviewSystemPrompt } from '../prompts/review.js';
import * as dal from '../db/dal.js';
import { logger } from '../utils/logger.js';

/**
 * Run the review agent for a stock's prediction.
 * If llmConfig is provided, uses that specific LLM and edits notes for that llm_id.
 */
export async function runReviewAgent(
  stock: Stock,
  prediction: Prediction,
  llmConfig?: LLMConfig
): Promise<void> {
  const llmId = llmConfig?.id ?? 'default';
  const llmLabel = llmConfig ? `${llmConfig.name}(${llmConfig.id})` : 'default';
  logger.info(`Review agent starting for ${stock.ticker} prediction ${prediction.prediction_date} [LLM: ${llmLabel}]`);

  // Build prompt context (per-LLM notes)
  const notes = dal.getAllNotes(llmId);

  const systemPrompt = buildReviewSystemPrompt({
    stock,
    prediction,
    notes,
  });

  // Define tools
  const tools: ToolHandler[] = [
    // 1. edit_note (per-LLM)
    {
      definition: {
        type: 'function',
        function: {
          name: 'edit_note',
          description:
            'Write or overwrite a note in the specified slot (1-50). Notes are per-LLM.',
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

        // Write to DB immediately (per-LLM)
        const updatedBy = `REVIEW:${stock.ticker}:${prediction.prediction_date}`;
        dal.updateNote(slotNumber, content.trim(), updatedBy, llmId);

        logger.info(`Note ${slotNumber} updated by review of ${stock.ticker} [LLM: ${llmLabel}]`);

        return {
          success: true,
          result: `Note #${slotNumber} updated successfully.`,
        };
      },
    },

    // 2. complete (terminal)
    {
      definition: {
        type: 'function',
        function: {
          name: 'complete',
          description: 'Call this when you have finished reviewing and editing notes.',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      execute: async () => {
        return { success: true, result: 'Review completed.' };
      },
    },
  ];

  // Create LLM client - use specific config if provided
  const llmClient = llmConfig
    ? createLLMClientForConfig(llmConfig)
    : createLLMClient(false);

  // rebuildMessages callback - always show latest note state (per-LLM)
  const rebuildMessages = (toolHistory: Message[]): Message[] => {
    // Re-read notes to get latest state (may have been modified by edit_note)
    const currentNotes = dal.getAllNotes(llmId);
    const updatedPrompt = buildReviewSystemPrompt({
      stock,
      prediction,
      notes: currentNotes,
    });

    return [
      { role: 'system', content: updatedPrompt },
      {
        role: 'user',
        content: '위 예측 결과를 분석하고, 교훈이 되는 내용을 노트에 작성하라. 작업이 끝나면 complete tool을 호출하라.',
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
    maxIterations: 15,
    onIteration: (iteration, toolName) => {
      logger.debug(`Review[${stock.ticker}][${llmLabel}] iteration ${iteration}: ${toolName}`);
    },
  });

  logger.info(`Review agent completed for ${stock.ticker} [LLM: ${llmLabel}] (${result.iterations} iterations, ${result.toolCallHistory.length} tool calls)`);
}
