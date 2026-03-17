/**
 * Prediction Agent System Prompt Builder.
 *
 * Constructs the full prediction prompt per REQUIREMENTS.md section 3.1.
 * Conditional blocks for first vs subsequent predictions.
 * 30-day price table. Notes section.
 */

import type { Stock, Prediction, StockPrice, Note, AccuracyStats } from '../types/index.js';

export interface PredictionPromptContext {
  stock: Stock;
  currentPrice: number | null;
  accuracy: AccuracyStats | null;
  recentPredictions: Prediction[];
  recentPrices: StockPrice[];
  notes: Note[];
  isFirstPrediction: boolean;
  lastClosePrice?: number | null;
  lastCloseDate?: string | null;
  targetDate?: string | null;
}

export function buildPredictionSystemPrompt(ctx: PredictionPromptContext): string {
  const { stock, currentPrice, accuracy, recentPredictions, recentPrices, notes, isFirstPrediction, lastClosePrice, lastCloseDate, targetDate } = ctx;

  let prompt = `You are a professional stock trader who MUST predict whether this stock will go UP, DOWN, or remain FLAT. There is no room for hesitation — you must decide.

You must predict the direction of the NEXT TRADING DAY's closing price
relative to the LAST available closing price.

You must use the search tool and your past correct/incorrect notes to accurately predict the direction of this stock.

[Stock Information]
- Ticker: ${stock.ticker}
- Name: ${stock.name}
- Market: ${stock.market}
- Current Price: ${currentPrice !== null ? formatPrice(currentPrice) : 'N/A'}
`;

  // Add prediction baseline information
  if (lastClosePrice != null && lastCloseDate && targetDate) {
    prompt += `
[Prediction Baseline]
- Reference Price (Last Close): ${formatPrice(lastClosePrice)} on ${lastCloseDate}
- Target: Next trading day's closing price (${targetDate})
`;
  }


  if (!isFirstPrediction && accuracy) {
    // Subsequent prediction: show accuracy and prediction history
    prompt += `
Your overall accuracy for this stock so far is ${accuracy.rate.toFixed(1)}%.
(${accuracy.total} total predictions: ${accuracy.correct} correct, ${accuracy.incorrect} incorrect)

Predictions vs Actual movements over the last 30 days:
| Date | Prediction | Actual Direction | Actual Change % | Close Price | Correct? |
|------|------------|-----------------|-----------------|-------------|----------|
`;

    // Build combined table from prices and predictions
    const predByDate = new Map<string, Prediction>();
    for (const pred of recentPredictions) {
      predByDate.set(pred.prediction_date, pred);
    }

    // Show last 30 prices (most recent first)
    const sortedPrices = [...recentPrices].sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    for (const price of sortedPrices.slice(0, 30)) {
      const pred = predByDate.get(price.date);
      if (pred) {
        const correctStr =
          pred.is_correct === 1 ? '✓' :
          pred.is_correct === 0 ? '✗' : '-';
        const actualDir = pred.actual_direction || '-';
        const actualRate = pred.actual_change_rate !== null
          ? `${pred.actual_change_rate >= 0 ? '+' : ''}${pred.actual_change_rate.toFixed(1)}%`
          : '-';
        const closeStr = pred.actual_close_price !== null
          ? formatPrice(pred.actual_close_price)
          : (price.close_price !== null ? formatPrice(price.close_price) : '-');

        prompt += `| ${price.date} | ${pred.direction} | ${actualDir} | ${actualRate} | ${closeStr} | ${correctStr} |\n`;
      } else {
        // No prediction for this date
        const changeStr = price.change_rate !== null
          ? `${price.change_rate >= 0 ? '+' : ''}${price.change_rate.toFixed(1)}%`
          : '-';
        const closeStr = price.close_price !== null ? formatPrice(price.close_price) : '-';
        const dir = price.change_rate !== null
          ? (price.change_rate > 0.3 ? 'UP' : price.change_rate < -0.3 ? 'DOWN' : 'FLAT')
          : '-';

        prompt += `| ${price.date} | Before tracking | ${dir} | ${changeStr} | ${closeStr} | - |\n`;
      }
    }

    prompt += `
* Days without predictions (before tracking started) are marked "Before tracking"
  and only show actual movement data and close price.
`;
  } else {
    // First prediction: show price history only
    prompt += `
Price movements for this stock over the last 30 days:
| Date | Change % | Close Price |
|------|----------|-------------|
`;

    const sortedPrices = [...recentPrices].sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    for (const price of sortedPrices.slice(0, 30)) {
      const changeStr = price.change_rate !== null
        ? `${price.change_rate >= 0 ? '+' : ''}${price.change_rate.toFixed(1)}%`
        : '-';
      const closeStr = price.close_price !== null ? formatPrice(price.close_price) : '-';
      prompt += `| ${price.date} | ${changeStr} | ${closeStr} |\n`;
    }
  }

  // Notes section
  const nonEmptyNotes = notes.filter(n => n.content && n.content.trim());
  if (nonEmptyNotes.length > 0) {
    prompt += `
[Correct/Incorrect Notes]
`;
    for (const note of nonEmptyNotes) {
      prompt += `[${note.slot_number}] ${note.content}\n`;
    }
    prompt += `[/Correct/Incorrect Notes]
`;
  } else {
    prompt += `
[Correct/Incorrect Notes]
(No notes have been written yet)
[/Correct/Incorrect Notes]
`;
  }

  prompt += `
Perform thorough research before making your prediction. Use the search tool to gather comprehensive evidence.
Recommended research strategy:
1. Search for recent news, earnings, and price catalysts for this stock
2. Search for sector/industry trends and macro conditions
3. Search for analyst opinions, institutional activity, or technical indicators
4. Review your notes for relevant past insights

Take your time - accuracy is more important than speed. Once you have gathered sufficient evidence, call the predict tool.
The search tool accepts a query (search keywords) and a question (what you want to find out).
You can use the read_notes tool to review all current notes at any time.

IMPORTANT: Write ALL your reasoning in ENGLISH. This ensures consistency across all LLM models and reports.

Prediction criteria:
- UP: Next close will be more than +0.3% above ${lastClosePrice != null ? formatPrice(lastClosePrice) : 'last close price'}
- DOWN: Next close will be more than -0.3% below ${lastClosePrice != null ? formatPrice(lastClosePrice) : 'last close price'}
- FLAT: Next close will be within +/-0.3% of ${lastClosePrice != null ? formatPrice(lastClosePrice) : 'last close price'}`;

  return prompt;
}

function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('ko-KR');
  }
  return price.toFixed(2);
}
