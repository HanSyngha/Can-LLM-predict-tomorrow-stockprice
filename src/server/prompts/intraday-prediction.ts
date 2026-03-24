/**
 * Intraday Prediction Agent System Prompt Builder.
 *
 * Constructs the full intraday prediction prompt.
 * Key differences from daily prediction:
 * - Reference: current price (not previous day's close)
 * - Target: price 1 hour from now
 * - Context: last 100 hourly prices (not 35 daily prices)
 * - Emphasis on short-term technical/momentum analysis
 */

import type { Stock, IntradayPrediction, Note, AccuracyStats } from '../types/index.js';

export interface IntradayPredictionPromptContext {
  stock: Stock;
  currentPrice: number | null;
  accuracy: AccuracyStats | null;
  recentIntradayPredictions: IntradayPrediction[];
  hourlyPrices: Array<{ datetime: string; price: number | null }>;
  notes: Note[];
  isFirstPrediction: boolean;
  referencePrice: number | null;
  targetTime: string; // e.g., "10:00" or "10:30"
  predictionTime: string; // e.g., "09:00" or "09:30"
  targetDate: string;
  flatThreshold?: number;
}

export function buildIntradayPredictionSystemPrompt(ctx: IntradayPredictionPromptContext): string {
  const {
    stock,
    currentPrice,
    accuracy,
    recentIntradayPredictions,
    hourlyPrices,
    notes,
    isFirstPrediction,
    referencePrice,
    targetTime,
    predictionTime,
    targetDate,
  } = ctx;

  let prompt = `You are a short-term intraday trader who MUST predict whether this stock's price will go UP, DOWN, or remain FLAT within the next 1 hour. There is no room for hesitation — you must decide.

You must predict the direction of the stock price at ${targetTime} (local market time)
relative to the current price at ${predictionTime}.

Focus on SHORT-TERM momentum, order flow, and intraday technical patterns.
Use the search tool to find real-time market news, earnings announcements, or catalysts.

[Stock Information]
- Ticker: ${stock.ticker}
- Name: ${stock.name}
- Market: ${stock.market}
- Current Price: ${currentPrice !== null ? formatPrice(currentPrice) : 'N/A'}
- Reference Price: ${referencePrice !== null ? formatPrice(referencePrice) : 'N/A'}
`;

  // Prediction baseline
  prompt += `
[Prediction Baseline]
- Prediction Time: ${predictionTime} on ${targetDate}
- Target Time: ${targetTime} on ${targetDate} (1 hour from now)
- Reference Price: ${referencePrice !== null ? formatPrice(referencePrice) : 'N/A'}
- Predict whether the price at ${targetTime} will be UP, DOWN, or FLAT relative to ${referencePrice !== null ? formatPrice(referencePrice) : 'current price'}
`;

  // Hourly price table
  if (hourlyPrices.length > 0) {
    prompt += `
[Hourly Price History (last ${hourlyPrices.length} entries)]
| Datetime | Price |
|----------|-------|
`;
    // Show most recent first
    const sorted = [...hourlyPrices].sort((a, b) => b.datetime.localeCompare(a.datetime));
    for (const hp of sorted.slice(0, 100)) {
      const priceStr = hp.price !== null ? formatPrice(hp.price) : '-';
      prompt += `| ${hp.datetime} | ${priceStr} |\n`;
    }
  } else {
    prompt += `
[Hourly Price History]
(No hourly price data available yet)
`;
  }

  // Today's earlier intraday predictions
  if (!isFirstPrediction && recentIntradayPredictions.length > 0) {
    prompt += `
[Today's Earlier Intraday Predictions]
| Time Slot | Direction | Reference | Actual Price | Change % | Correct? |
|-----------|-----------|-----------|-------------|----------|----------|
`;
    for (const pred of recentIntradayPredictions) {
      const timeSlot = `${pad(pred.prediction_hour)}:${pad(pred.prediction_minute)}->${pad(pred.target_hour)}:${pad(pred.target_minute)}`;
      const refStr = pred.reference_price !== null ? formatPrice(pred.reference_price) : '-';
      const actualStr = pred.actual_price !== null ? formatPrice(pred.actual_price) : 'Pending';
      const changeStr = pred.actual_change_rate !== null
        ? `${pred.actual_change_rate >= 0 ? '+' : ''}${pred.actual_change_rate.toFixed(2)}%`
        : '-';
      const correctStr =
        pred.is_correct === 1 ? 'O' :
        pred.is_correct === 0 ? 'X' : '-';
      prompt += `| ${timeSlot} | ${pred.direction} | ${refStr} | ${actualStr} | ${changeStr} | ${correctStr} |\n`;
    }
  }

  // Accuracy stats
  if (!isFirstPrediction && accuracy && accuracy.total > 0) {
    prompt += `
[Intraday Accuracy]
Your intraday accuracy so far: ${accuracy.rate.toFixed(1)}%
(${accuracy.total} total: ${accuracy.correct} correct, ${accuracy.incorrect} incorrect)
`;
  }

  // Notes section
  const nonEmptyNotes = notes.filter(n => n.content && n.content.trim());
  if (nonEmptyNotes.length > 0) {
    prompt += `
[Intraday Notes]
`;
    for (const note of nonEmptyNotes) {
      prompt += `[${note.slot_number}] ${note.content}\n`;
    }
    prompt += `[/Intraday Notes]
`;
  } else {
    prompt += `
[Intraday Notes]
(No intraday notes have been written yet)
[/Intraday Notes]
`;
  }

  prompt += `
Perform quick research before making your prediction. Use the search tool to find real-time market news and catalysts.
Recommended research strategy:
1. Search for breaking news or events affecting this stock RIGHT NOW
2. Search for sector momentum, market sentiment, or macro events today
3. Review your intraday notes for relevant short-term patterns
4. Analyze the hourly price trend from the table above

Focus on SHORT-TERM factors: momentum, volume spikes, news catalysts, technical levels.
Once you have gathered sufficient evidence, call the predict tool.
The search tool accepts a query (search keywords) and a question (what you want to find out).
You can use the read_notes tool to review all current intraday notes at any time.

IMPORTANT: Write ALL your reasoning in ENGLISH. This ensures consistency across all LLM models and reports.

Prediction criteria:
- UP: Price at ${targetTime} will be more than +${ctx.flatThreshold ?? 0.15}% above ${referencePrice !== null ? formatPrice(referencePrice) : 'reference price'}
- DOWN: Price at ${targetTime} will be more than -${ctx.flatThreshold ?? 0.15}% below ${referencePrice !== null ? formatPrice(referencePrice) : 'reference price'}
- FLAT: Price at ${targetTime} will be within +/-${ctx.flatThreshold ?? 0.15}% of ${referencePrice !== null ? formatPrice(referencePrice) : 'reference price'}`;

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
