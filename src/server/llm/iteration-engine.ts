/**
 * Core Iteration Engine
 *
 * Adapted from Hanseol chatCompletionWithTools pattern.
 * - rebuildMessages callback per iteration
 * - Terminal tool detection (returns when predict/complete called)
 * - Single tool per turn enforcement
 * - ContextLengthError recovery (rollback last tool group)
 * - Max 3 no-tool-call retries
 */

import type {
  Message,
  ToolHandler,
  ToolDefinition,
  IterationEngineConfig,
  IterationResult,
  ToolCallRecord,
  LLMResponse,
} from '../types/index.js';
import { ContextLengthError } from './llm-client.js';
import { logger } from '../utils/logger.js';

const MAX_NO_TOOL_CALL_RETRIES = 5;

export async function runIterationEngine(
  config: IterationEngineConfig
): Promise<IterationResult> {
  const {
    llmClient,
    tools,
    terminalTools,
    rebuildMessages,
    maxIterations = 50,
    onIteration,
  } = config;

  const toolMap = new Map<string, ToolHandler>();
  for (const tool of tools) {
    toolMap.set(tool.definition.function.name, tool);
  }

  const toolDefinitions: ToolDefinition[] = tools.map(t => t.definition);
  const terminalSet = new Set(terminalTools);

  const toolLoopMessages: Message[] = [];
  const toolCallHistory: ToolCallRecord[] = [];

  let iterations = 0;
  let noToolCallRetries = 0;
  let contextLengthRecoveryAttempted = false;

  // Helper: add message to tool loop
  const addMessage = (msg: Message) => {
    toolLoopMessages.push(msg);
  };

  while (iterations < maxIterations) {
    iterations++;

    // Rebuild messages each iteration
    const workingMessages = rebuildMessages(toolLoopMessages);

    if (onIteration) {
      onIteration(iterations, '');
    }

    // LLM call
    let response: LLMResponse;
    try {
      response = await llmClient.chatCompletion({
        messages: workingMessages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        temperature: 0.7,
      });
    } catch (error) {
      // ContextLengthError recovery: rollback last tool group + retry
      if (error instanceof ContextLengthError && !contextLengthRecoveryAttempted) {
        contextLengthRecoveryAttempted = true;
        logger.warn('ContextLengthError detected - rolling back last tool group');

        // Rollback: remove from the end until we pass the last assistant message with tool_calls
        let rollbackIdx = toolLoopMessages.length - 1;
        while (rollbackIdx >= 0 && toolLoopMessages[rollbackIdx]?.role === 'tool') {
          rollbackIdx--;
        }
        if (rollbackIdx >= 0 && toolLoopMessages[rollbackIdx]?.tool_calls) {
          toolLoopMessages.length = rollbackIdx;
          logger.info('Rolled back toolLoopMessages', { newLength: toolLoopMessages.length });
        }
        // Retry on next iteration
        continue;
      }
      throw error;
    }

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choice in LLM response');
    }

    const assistantMessage = choice.message;
    addMessage(assistantMessage);

    // Check for tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      noToolCallRetries = 0;

      // Enforce single tool per turn
      if (assistantMessage.tool_calls.length > 1) {
        const toolNames = assistantMessage.tool_calls.map(tc => tc.function.name).join(', ');
        logger.warn(`[SINGLE-TOOL ENFORCED] LLM returned ${assistantMessage.tool_calls.length} tools, truncating: ${toolNames}`);
        assistantMessage.tool_calls = [assistantMessage.tool_calls[0]!];
      }

      for (const toolCall of assistantMessage.tool_calls!) {
        const toolName = toolCall.function.name;

        // Parse arguments
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          const errorMsg = `Error: Failed to parse tool arguments for "${toolName}". Ensure valid JSON.`;
          addMessage({
            role: 'tool',
            content: errorMsg,
            tool_call_id: toolCall.id,
          });
          toolCallHistory.push({
            tool: toolName,
            args: { raw: toolCall.function.arguments },
            result: errorMsg,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Check if this is a terminal tool
        if (terminalSet.has(toolName)) {
          logger.info(`Terminal tool called: ${toolName}`);

          // Add tool result for API compliance
          addMessage({
            role: 'tool',
            content: `Terminal tool "${toolName}" called. Iteration complete.`,
            tool_call_id: toolCall.id,
          });

          toolCallHistory.push({
            tool: toolName,
            args: toolArgs,
            result: `Terminal tool called`,
            timestamp: new Date().toISOString(),
          });

          return {
            terminalToolName: toolName,
            terminalToolArgs: toolArgs,
            toolCallHistory,
            allMessages: toolLoopMessages,
            iterations,
          };
        }

        // Find and execute tool
        const handler = toolMap.get(toolName);
        if (!handler) {
          const errorMsg = `Error: Unknown tool "${toolName}". Available tools: ${[...toolMap.keys()].join(', ')}`;
          addMessage({
            role: 'tool',
            content: errorMsg,
            tool_call_id: toolCall.id,
          });
          toolCallHistory.push({
            tool: toolName,
            args: toolArgs,
            result: errorMsg,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        if (onIteration) {
          onIteration(iterations, toolName);
        }

        logger.info(`Executing tool: ${toolName}`, { iteration: iterations });

        try {
          const execResult = await handler.execute(toolArgs);
          const resultText = execResult.success
            ? execResult.result || '(success)'
            : `Error: ${execResult.error || 'Unknown error'}`;

          addMessage({
            role: 'tool',
            content: resultText,
            tool_call_id: toolCall.id,
          });

          toolCallHistory.push({
            tool: toolName,
            args: toolArgs,
            result: resultText,
            timestamp: new Date().toISOString(),
          });
        } catch (execError) {
          const errorMsg = `Error executing ${toolName}: ${execError instanceof Error ? execError.message : String(execError)}`;
          addMessage({
            role: 'tool',
            content: errorMsg,
            tool_call_id: toolCall.id,
          });
          toolCallHistory.push({
            tool: toolName,
            args: toolArgs,
            result: errorMsg,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Continue loop
      continue;
    } else {
      // No tool call - treat as ERROR and retry immediately
      noToolCallRetries++;
      logger.warn(`No tool call - ERROR (retry ${noToolCallRetries}/${MAX_NO_TOOL_CALL_RETRIES})`);

      if (noToolCallRetries >= MAX_NO_TOOL_CALL_RETRIES) {
        logger.warn('Max no-tool-call retries exceeded - marking as UNABLE');
        return {
          terminalToolName: null,
          terminalToolArgs: null,
          toolCallHistory,
          allMessages: toolLoopMessages,
          iterations,
        };
      }

      // Remove the last assistant message (no tool calls) and immediately retry the SAME request
      toolLoopMessages.pop();

      continue;
    }
  }

  // Max iterations reached
  logger.warn(`Iteration engine max iterations reached: ${maxIterations}`);
  return {
    terminalToolName: null,
    terminalToolArgs: null,
    toolCallHistory,
    allMessages: toolLoopMessages,
    iterations,
  };
}
