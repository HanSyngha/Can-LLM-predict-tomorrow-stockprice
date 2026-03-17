/**
 * Accuracy calculation and judgement logic.
 */

import type { Direction, Prediction, AccuracyStats } from '../types/index.js';

/**
 * Judge whether a prediction was correct based on actual change rate.
 *
 * @param predicted - The predicted direction
 * @param actualChangeRate - The actual price change percentage
 * @param flatThreshold - Threshold for FLAT judgement (default 0.3%)
 * @returns true (correct), false (incorrect), or null (unable/no data)
 */
export function judgeCorrectness(
  predicted: Direction,
  actualChangeRate: number | null,
  flatThreshold = 0.3
): boolean | null {
  if (predicted === 'UNABLE' || actualChangeRate === null) {
    return null;
  }

  switch (predicted) {
    case 'UP':
      return actualChangeRate > flatThreshold;
    case 'DOWN':
      return actualChangeRate < -flatThreshold;
    case 'FLAT':
      return Math.abs(actualChangeRate) <= flatThreshold;
    default:
      return null;
  }
}

/**
 * Determine actual direction from change rate.
 */
export function determineDirection(
  changeRate: number,
  flatThreshold = 0.3
): Direction {
  if (changeRate > flatThreshold) return 'UP';
  if (changeRate < -flatThreshold) return 'DOWN';
  return 'FLAT';
}

/**
 * Calculate accuracy stats from a list of predictions.
 */
export function calculateAccuracy(predictions: Prediction[]): AccuracyStats {
  let total = 0;
  let correct = 0;
  let incorrect = 0;
  let unable = 0;

  for (const pred of predictions) {
    if (pred.direction === 'UNABLE') {
      unable++;
      continue;
    }

    if (pred.actual_direction !== null) {
      total++;
      if (pred.is_correct === 1) {
        correct++;
      } else if (pred.is_correct === 0) {
        incorrect++;
      }
    }
  }

  return {
    total,
    correct,
    incorrect,
    unable,
    rate: total > 0 ? (correct / total) * 100 : 0,
  };
}
