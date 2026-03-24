/**
 * Intraday Review Agent System Prompt Builder.
 *
 * Constructs the intraday review prompt.
 * Shows all of today's intraday predictions with results.
 * Win/loss ratio, per-hour patterns.
 * All 50 intraday notes.
 */

import type { Stock, IntradayPrediction, Note, AccuracyStats } from '../types/index.js';

export interface IntradayReviewPromptContext {
  stock: Stock;
  todayPredictions: IntradayPrediction[];
  notes: Note[];
  accuracy: AccuracyStats | null;
  date: string;
}

export function buildIntradayReviewSystemPrompt(ctx: IntradayReviewPromptContext): string {
  const { stock, todayPredictions, notes, accuracy, date } = ctx;

  let prompt = `You are reviewing today's intraday predictions for ${stock.name} (${stock.ticker}) on ${date}.
Your goal is to extract SHORT-TERM trading lessons from today's intraday performance.
`;

  // Summary stats
  const resolved = todayPredictions.filter(p => p.is_correct !== null);
  const correct = resolved.filter(p => p.is_correct === 1).length;
  const incorrect = resolved.filter(p => p.is_correct === 0).length;
  const pending = todayPredictions.filter(p => p.is_correct === null).length;

  prompt += `
[Today's Intraday Summary]
- Total predictions: ${todayPredictions.length}
- Resolved: ${resolved.length} (${correct} correct, ${incorrect} incorrect)
- Pending: ${pending}
- Today's win rate: ${resolved.length > 0 ? ((correct / resolved.length) * 100).toFixed(1) : 'N/A'}%
`;

  // Overall accuracy
  if (accuracy && accuracy.total > 0) {
    prompt += `
[Overall Intraday Accuracy]
- Total: ${accuracy.total} predictions
- Correct: ${accuracy.correct}, Incorrect: ${accuracy.incorrect}
- Accuracy rate: ${accuracy.rate.toFixed(1)}%
`;
  }

  // Per-prediction detail
  if (todayPredictions.length > 0) {
    prompt += `
[Today's Intraday Predictions Detail]
| # | Time Slot | Direction | Reference | Actual Price | Change % | Correct? | Reasoning (summary) |
|---|-----------|-----------|-----------|-------------|----------|----------|---------------------|
`;
    todayPredictions.forEach((pred, idx) => {
      const timeSlot = `${pad(pred.prediction_hour)}:${pad(pred.prediction_minute)}->${pad(pred.target_hour)}:${pad(pred.target_minute)}`;
      const refStr = pred.reference_price !== null ? formatPrice(pred.reference_price) : '-';
      const actualStr = pred.actual_price !== null ? formatPrice(pred.actual_price) : 'Pending';
      const changeStr = pred.actual_change_rate !== null
        ? `${pred.actual_change_rate >= 0 ? '+' : ''}${pred.actual_change_rate.toFixed(2)}%`
        : '-';
      const correctStr =
        pred.is_correct === 1 ? 'CORRECT' :
        pred.is_correct === 0 ? 'INCORRECT' : 'PENDING';
      const reasoningSummary = pred.reasoning
        ? pred.reasoning.slice(0, 80) + (pred.reasoning.length > 80 ? '...' : '')
        : 'N/A';

      prompt += `| ${idx + 1} | ${timeSlot} | ${pred.direction} | ${refStr} | ${actualStr} | ${changeStr} | ${correctStr} | ${reasoningSummary} |\n`;
    });

    // Per-hour pattern analysis
    const hourMap = new Map<number, { correct: number; total: number }>();
    for (const pred of resolved) {
      const hour = pred.prediction_hour;
      const entry = hourMap.get(hour) || { correct: 0, total: 0 };
      entry.total++;
      if (pred.is_correct === 1) entry.correct++;
      hourMap.set(hour, entry);
    }

    if (hourMap.size > 0) {
      prompt += `
[Per-Hour Pattern (today)]
| Hour | Predictions | Correct | Win Rate |
|------|-------------|---------|----------|
`;
      for (const [hour, stats] of [...hourMap.entries()].sort((a, b) => a[0] - b[0])) {
        const rate = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(0) : '-';
        prompt += `| ${pad(hour)}:00 | ${stats.total} | ${stats.correct} | ${rate}% |\n`;
      }
    }
  } else {
    prompt += `
[No intraday predictions were made today]
`;
  }

  // Show search history for predictions with search reports
  const predsWithSearches = todayPredictions.filter(p => p.search_reports);
  if (predsWithSearches.length > 0) {
    prompt += `
[Search Reports from Today's Predictions]
`;
    for (const pred of predsWithSearches) {
      const timeSlot = `${pad(pred.prediction_hour)}:${pad(pred.prediction_minute)}`;
      try {
        const reports = pred.search_reports ? JSON.parse(pred.search_reports) as string[] : [];
        if (reports.length > 0) {
          prompt += `\n--- Slot ${timeSlot} Research ---\n`;
          for (const report of reports) {
            const truncated = report.length > 1000 ? report.slice(0, 1000) + '...(truncated)' : report;
            prompt += `${truncated}\n`;
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  prompt += `
Based on this review, extract 1-3 KEY intraday trading lessons. Focus on:
- Which time slots were most/least accurate
- What short-term patterns worked or failed
- How market momentum shifted during the day
- Which search-based signals were useful vs misleading

[Current Intraday Notes State 1~50]
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
Use the edit_note tool to write or update intraday notes.

=== NOTE WRITING RULES (CRITICAL) ===
1. Write ONLY 1-3 notes per review. Do NOT fill all slots.
2. UPDATE FIRST: If an existing note covers a similar topic, UPDATE that slot with improved content instead of writing a new one.
3. Only use empty slots when the lesson is genuinely new and not covered by any existing note.
4. Each note should be a single, specific, actionable SHORT-TERM trading lesson.
5. Slot numbers must be between 1 and 50.
6. Notes are shared across all stocks — focus on general intraday trading patterns.
7. ALWAYS write notes in ENGLISH for consistency.
8. When done, call the complete tool immediately. Do NOT keep writing more notes.`;

  return prompt;
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('ko-KR');
  }
  return price.toFixed(2);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
