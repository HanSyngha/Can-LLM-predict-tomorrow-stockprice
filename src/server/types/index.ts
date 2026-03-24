// === LLM Types (ported from Hanseol) ===

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface LLMResponse {
  choices: Array<{
    message: Message;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// === Iteration Engine Types ===

export interface ToolHandler {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
}

export interface IterationEngineConfig {
  llmClient: LLMClientInterface;
  tools: ToolHandler[];
  terminalTools: string[];
  rebuildMessages: (toolHistory: Message[]) => Message[];
  maxIterations?: number;
  onIteration?: (iteration: number, toolName: string) => void;
}

export interface IterationResult {
  terminalToolName: string | null;
  terminalToolArgs: Record<string, unknown> | null;
  toolCallHistory: ToolCallRecord[];
  allMessages: Message[];
  iterations: number;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  result: string;
  timestamp: string;
}

export interface LLMClientInterface {
  chatCompletion(options: {
    messages: Message[];
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'none' | 'required';
    temperature?: number;
  }): Promise<LLMResponse>;
}

// === Domain Types ===

export type Direction = 'UP' | 'DOWN' | 'FLAT' | 'UNABLE';
export type ApiSource = 'YAHOO';
export type Market = 'KOSPI' | 'KOSDAQ' | 'NASDAQ' | 'NYSE' | string;

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

export interface NewStock {
  ticker: string;
  name: string;
  name_ko?: string | null;
  market: Market;
  api_source: ApiSource;
}

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

export interface NewStockPrice {
  ticker: string;
  date: string;
  open_price?: number | null;
  close_price?: number | null;
  high_price?: number | null;
  low_price?: number | null;
  volume?: number | null;
  change_rate?: number | null;
}

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

export interface NewPrediction {
  llm_id: string;
  ticker: string;
  prediction_date: string;
  direction: Direction;
  reasoning?: string | null;
  search_queries?: string | null;
  search_reports?: string | null;
  tool_call_history?: string | null;
}

export interface ActualResult {
  actual_direction: Direction;
  actual_change_rate: number;
  actual_close_price: number;
  is_correct: number | null;
}

export interface Note {
  llm_id: string;
  slot_number: number;
  content: string | null;
  content_ko: string | null;
  last_updated_at: string | null;
  last_updated_by: string | null;
}

export interface AccuracyHistoryEntry {
  id: number;
  date: string;
  total_predictions: number;
  total_correct: number;
  accuracy_rate: number;
  recorded_at: string;
}

export interface AccuracyStats {
  total: number;
  correct: number;
  incorrect: number;
  unable: number;
  rate: number;
}

// === Proxy Settings (Agent-Dashboard integration) ===

export interface ProxySettings {
  serviceId: string;       // x-service-id header (e.g. "stock")
  deptName: string;        // x-dept-name header (e.g. "S/W혁신팀(S.LSI)")
}

// === Settings Types ===

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

export interface LLMConfig {
  id: string;        // unique identifier like 'glm-5', 'glm-4.7'
  name: string;      // display name
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

export interface ScheduleSettings {
  predictionCron: string;
  reviewCron: string;
}

export interface GeneralSettings {
  flatThreshold: number;
  intradayFlatThreshold?: number;
  nasdaqDst?: 'auto' | 'on' | 'off';
}

// === Intraday Types ===

export interface IntradayPrice {
  id: number;
  ticker: string;
  datetime: string;
  price: number | null;
  volume: number | null;
  fetched_at: string;
}

export interface NewIntradayPrice {
  ticker: string;
  datetime: string;
  price: number | null;
  volume?: number | null;
}

export interface IntradayPrediction {
  id: number;
  llm_id: string;
  ticker: string;
  prediction_date: string;
  prediction_hour: number;
  prediction_minute: number;
  target_hour: number;
  target_minute: number;
  created_at: string;
  direction: Direction;
  reasoning: string | null;
  search_queries: string | null;
  search_reports: string | null;
  tool_call_history: string | null;
  reference_price: number | null;
  actual_direction: Direction | null;
  actual_change_rate: number | null;
  actual_price: number | null;
  is_correct: number | null;
  reasoning_ko: string | null;
  search_reports_ko: string | null;
}

export interface NewIntradayPrediction {
  llm_id: string;
  ticker: string;
  prediction_date: string;
  prediction_hour: number;
  prediction_minute: number;
  target_hour: number;
  target_minute: number;
  direction: Direction;
  reference_price?: number | null;
  reasoning?: string | null;
  search_queries?: string | null;
  search_reports?: string | null;
  tool_call_history?: string | null;
}

export interface IntradaySlot {
  predictAtHour: number;
  predictAtMinute: number;
  targetHour: number;
  targetMinute: number;
}

export interface IntradaySummary {
  overallAccuracy: number;
  totalPredictions: number;
  totalCorrect: number;
  todayPredictions: number;
  todayCorrect: number;
  llmAccuracies: LLMAccuracySummary[];
}

// === API Response Types ===

export interface LLMAccuracySummary {
  llmId: string;
  llmName: string;
  accuracy: number;
  totalPredictions: number;
  totalCorrect: number;
}

export interface DashboardSummary {
  overallAccuracy: number;
  totalPredictions: number;
  totalCorrect: number;
  stockCount: number;
  llmAccuracies: LLMAccuracySummary[];
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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface TickerSearchResult {
  ticker: string;
  name: string;
  name_ko?: string | null;
  market: string;
  apiSource: ApiSource;
}
