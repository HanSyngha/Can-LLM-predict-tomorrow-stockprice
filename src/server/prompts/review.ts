/**
 * Review Agent System Prompt Builder.
 *
 * Constructs review prompt per REQUIREMENTS.md section 3.4.
 * Shows yesterday's prediction vs actual.
 * Search history. All 50 notes with empty slots.
 */

import type { Stock, Prediction, Note } from '../types/index.js';

export interface ReviewPromptContext {
  stock: Stock;
  prediction: Prediction;
  notes: Note[];
}

export function buildReviewSystemPrompt(ctx: ReviewPromptContext): string {
  const { stock, prediction, notes } = ctx;

  const isCorrect = prediction.is_correct === 1 ? 'CORRECT' : 'INCORRECT';
  const actualChangeStr = prediction.actual_change_rate !== null
    ? `${prediction.actual_change_rate >= 0 ? '+' : ''}${prediction.actual_change_rate.toFixed(2)}%`
    : 'N/A';
  const actualDir = prediction.actual_direction || 'N/A';

  let prompt = `You predicted "${prediction.direction}" for ${stock.name} (${stock.ticker}) yesterday.
The actual movement was ${actualDir} (${actualChangeStr}).
Result: ${isCorrect}
`;

  // Show prediction reasoning
  if (prediction.reasoning) {
    prompt += `
Your prediction reasoning:
${prediction.reasoning}
`;
  }

  // Show search history
  if (prediction.search_queries || prediction.search_reports) {
    prompt += `
Your search agent research from yesterday:
`;
    try {
      const queries = prediction.search_queries ? JSON.parse(prediction.search_queries) as string[] : [];
      if (queries.length > 0) {
        prompt += `Search queries: ${queries.join(', ')}\n`;
      }
    } catch {
      // ignore parse errors
    }

    try {
      const reports = prediction.search_reports ? JSON.parse(prediction.search_reports) as string[] : [];
      for (let i = 0; i < reports.length; i++) {
        const report = reports[i]!;
        // Truncate long reports
        const truncated = report.length > 2000 ? report.slice(0, 2000) + '...(truncated)' : report;
        prompt += `\n--- Search Report ${i + 1} ---\n${truncated}\n`;
      }
    } catch {
      // ignore parse errors
    }
  }

  prompt += `
Based on this review, extract 1-3 KEY lessons learned. Be selective — only write truly important insights.

[Current Notes State 1~50]
| Slot | Content |
|------|---------|
`;

  // Show all 50 note slots
  for (const note of notes) {
    const content = note.content && note.content.trim()
      ? note.content.trim()
      : '(empty)';
    prompt += `| ${note.slot_number} | ${content} |\n`;
  }

  prompt += `
Use the edit_note tool to write or update notes.

=== NOTE WRITING RULES (CRITICAL) ===
1. Write ONLY 1-3 notes per review. Do NOT fill all slots.
2. UPDATE FIRST: If an existing note covers a similar topic, UPDATE that slot with improved content instead of writing a new one.
3. Only use empty slots when the lesson is genuinely new and not covered by any existing note.
4. Each note should be a single, specific, actionable lesson.
5. Slot numbers must be between 1 and 50.
6. Notes are shared across all stocks — focus on general investment lessons.
7. ALWAYS write notes in ENGLISH for consistency.
8. When done, call the complete tool immediately. Do NOT keep writing more notes.`;

  return prompt;
}
