// === Direction ===
export type Direction = 'UP' | 'DOWN' | 'FLAT' | 'UNABLE';
export type ApiSource = 'YAHOO';
export type Market = 'KOSPI' | 'KOSDAQ' | 'NASDAQ' | 'NYSE' | string;

// === Stock ===
export interface Stock {
  id: number;
  ticker: string;
  name: string;
  name_ko?: string | null;
  market: Market;
  api_source: ApiSource;
  added_at: string;
  is_active: number;
}

export interface StockSummary extends Stock {
  currentPrice: number | null;
  changeRate: number | null;
  accuracy: number;
  totalPredictions: number;
  lastPrediction: {
    direction: Direction;
    is_correct: number | null;
    prediction_date: string;
  } | null;
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  name_ko?: string | null;
  market: string;
  apiSource: ApiSource;
}

// === Stock Price ===
export interface StockPrice {
  id: number;
  ticker: string;
  date: string;
  open_price: number | null;
  close_price: number | null;
  high_price: number | null;
  low_price: number | null;
  volume: number | null;
  change_rate: number | null;
  fetched_at: string;
}

// === Prediction ===
export interface Prediction {
  id: number;
  llm_id: string;
  ticker: string;
  prediction_date: string;
  created_at: string;
  direction: Direction;
  reasoning: string | null;
  search_queries: string | null;
  search_reports: string | null;
  tool_call_history: string | null;
  actual_direction: Direction | null;
  actual_change_rate: number | null;
  actual_close_price: number | null;
  is_correct: number | null;
  reasoning_ko: string | null;
  search_reports_ko: string | null;
}

// === Note ===
export interface Note {
  llm_id: string;
  slot_number: number;
  content: string | null;
  content_ko: string | null;
  last_updated_at: string | null;
  last_updated_by: string | null;
}

// === LLM Config ===
export interface LLMConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

// === Date Prediction Comparison (all LLMs for a stock) ===
export interface DatePredictionComparison {
  date: string;
  actual_direction: Direction | null;
  actual_change_rate: number | null;
  actual_close_price: number | null;
  predictions: Array<{
    llm_id: string;
    llm_name: string;
    direction: Direction;
    is_correct: number | null;
    reasoning: string | null;
  }>;
}

export interface SingleLLMComparison {
  llm_id: string;
  llm_name: string;
  direction: Direction;
  reasoning: string | null;
  is_correct: number | null;
}

// === Translate LLM Settings ===
export interface TranslateLLMSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

// === LLM Comparison ===
export interface LLMComparisonEntry {
  llmId: string;
  llmName: string;
  model: string;
  isActive: boolean;
  accuracy: number;
  totalPredictions: number;
  totalCorrect: number;
  totalIncorrect: number;
  unable: number;
}

export interface LLMAccuracySummary {
  llmId: string;
  llmName: string;
  accuracy: number;
  totalPredictions: number;
  totalCorrect: number;
}

// === Dashboard ===
export interface DashboardSummary {
  overallAccuracy: number;
  totalPredictions: number;
  totalCorrect: number;
  stockCount: number;
  llmAccuracies: LLMAccuracySummary[];
}

export interface AccuracyHistoryEntry {
  id?: number;
  date: string;
  total_predictions: number;
  total_correct: number;
  accuracy_rate: number;
  recorded_at?: string;
}

// === Settings ===
export interface LLMProviderSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  searchProvider?: string;
  searchBaseUrl?: string;
  searchApiKey?: string;
  searchModel?: string;
}

export interface ScheduleSettings {
  predictionCron: string;
  reviewCron: string;
}

export interface GeneralSettings {
  flatThreshold: number;
}

// === Scheduler Status ===
export interface SchedulerStatusResult {
  ticker: string;
  llmId: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  direction?: string;
  error?: string;
  durationMs?: number;
  searchIteration?: number;
}

export interface LLMAvgDuration {
  totalMs: number;
  count: number;
  avgMs: number;
}

export interface SchedulerStatus {
  phase: 'idle' | 'predicting' | 'reviewing';
  currentStock: string | null;
  currentLLM: string | null;
  progress: { completed: number; total: number };
  results: SchedulerStatusResult[];
  startedAt: string | null;
  llmAvgDurations: Record<string, LLMAvgDuration>;
}

// === API ===
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}
