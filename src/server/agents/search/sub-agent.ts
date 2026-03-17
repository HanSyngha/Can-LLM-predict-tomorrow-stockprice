/**
 * Search Sub-Agent Iteration Loop.
 *
 * Simple mode (message accumulation, no rebuildMessages).
 * Max 30 iterations, temperature 0.3.
 * Budget warnings at 30% and 15% remaining.
 * Uses LLMClient directly.
 */

import type {
  Message,
  ToolHandler,
  ToolDefinition,
  LLMClientInterface,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';

export interface SubAgentConfig {
  maxIterations?: number;
  temperature?: number;
}

export interface SubAgentResult {
  success: boolean;
  report: string;
  iterations: number;
  toolCalls: number;
}

export class SearchSubAgent {
  private llmClient: LLMClientInterface;
  private tools: ToolHandler[];
  private toolMap: Map<string, ToolHandler>;
  private systemPrompt: string;
  private maxIterations: number;
  private temperature: number;

  constructor(
    llmClient: LLMClientInterface,
    tools: ToolHandler[],
    systemPrompt: string,
    config?: SubAgentConfig
  ) {
    this.llmClient = llmClient;
    this.tools = tools;
    this.systemPrompt = systemPrompt;
    this.maxIterations = config?.maxIterations ?? 30;
    this.temperature = config?.temperature ?? 0.3;

    this.toolMap = new Map();
    for (const tool of tools) {
      this.toolMap.set(tool.definition.function.name, tool);
    }
  }

  async run(instruction: string): Promise<SubAgentResult> {
    let iterations = 0;
    let totalToolCalls = 0;

    logger.info('SearchSubAgent starting', { instruction: instruction.slice(0, 100) });

    // Build tool definitions
    const toolDefinitions: ToolDefinition[] = this.tools.map(t => t.definition);

    // Simple mode: single growing messages array
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: instruction },
    ];

    while (iterations < this.maxIterations) {
      iterations++;
      logger.debug(`SearchSubAgent iteration ${iterations}/${this.maxIterations}`);

      // Inject budget warnings
      const remaining = this.maxIterations - iterations;
      const earlyThreshold = Math.max(3, Math.floor(this.maxIterations * 0.3));
      const emergencyThreshold = Math.max(2, Math.floor(this.maxIterations * 0.15));

      if (remaining <= earlyThreshold && remaining > emergencyThreshold) {
        messages.push({
          role: 'user',
          content: `WARNING: Only ${remaining} iteration(s) remaining out of ${this.maxIterations}! Wrap up your research and call "complete" soon.`,
        });
      } else if (remaining <= emergencyThreshold && remaining > 0) {
        messages.push({
          role: 'user',
          content: `EMERGENCY: Only ${remaining} iteration(s) left! Call "complete" NOW with whatever you have gathered.`,
        });
      }

      const response = await this.llmClient.chatCompletion({
        messages,
        tools: toolDefinitions,
        temperature: this.temperature,
      });

      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        return {
          success: false,
          report: 'No response from search LLM',
          iterations,
          toolCalls: totalToolCalls,
        };
      }

      // No tool calls = text response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const content = assistantMessage.content || '';
        if (!content.trim()) {
          // Empty - retry
          logger.warn('SearchSubAgent got empty response, retrying');
          continue;
        }
        logger.info('SearchSubAgent completed with text response');
        return {
          success: true,
          report: content,
          iterations,
          toolCalls: totalToolCalls,
        };
      }

      messages.push(assistantMessage);

      // Process tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let args: Record<string, unknown>;

        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          messages.push({
            role: 'tool',
            content: 'Error: Invalid JSON in tool arguments.',
            tool_call_id: toolCall.id,
          });
          continue;
        }

        // Handle complete tool (terminal)
        if (toolName === 'complete') {
          const summary = (args.summary as string) || 'Research completed.';
          logger.info('SearchSubAgent completed via complete tool');
          return {
            success: true,
            report: summary,
            iterations,
            toolCalls: totalToolCalls,
          };
        }

        // Execute tool
        const handler = this.toolMap.get(toolName);
        if (!handler) {
          messages.push({
            role: 'tool',
            content: `Error: Unknown tool "${toolName}".`,
            tool_call_id: toolCall.id,
          });
          continue;
        }

        totalToolCalls++;
        logger.debug(`SearchSubAgent executing: ${toolName}`);

        try {
          const result = await handler.execute(args);
          const resultText = result.success
            ? result.result || '(success)'
            : `Error: ${result.error || 'Unknown error'}`;

          messages.push({
            role: 'tool',
            content: resultText,
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          messages.push({
            role: 'tool',
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            tool_call_id: toolCall.id,
          });
        }
      }
    }

    // Max iterations reached
    logger.warn('SearchSubAgent max iterations reached');
    return {
      success: true,
      report: `Search agent completed after ${this.maxIterations} iterations. ${totalToolCalls} tool calls executed. Could not call complete in time.`,
      iterations,
      toolCalls: totalToolCalls,
    };
  }
}
