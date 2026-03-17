import type {
  DashboardSummary,
  StockSummary,
  Stock,
  StockPrice,
  Prediction,
  Note,
  AccuracyHistoryEntry,
  PaginatedResponse,
  LLMProviderSettings,
  ScheduleSettings,
  GeneralSettings,
  StockSearchResult,
  LLMConfig,
  LLMComparisonEntry,
  DatePredictionComparison,
  SingleLLMComparison,
  TranslateLLMSettings,
} from './types';
import { ApiError } from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  if (res.status === 204) return undefined as T;

  return res.json();
}

// === Dashboard ===
export const dashboardApi = {
  getSummary: () => request<DashboardSummary>('/dashboard/summary'),
  getAccuracyHistory: (limit?: number, llmId?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (llmId) params.set('llm_id', llmId);
    const qs = params.toString();
    return request<AccuracyHistoryEntry[]>(
      `/dashboard/accuracy-history${qs ? `?${qs}` : ''}`
    );
  },
  getLLMComparison: () => request<LLMComparisonEntry[]>('/dashboard/llm-comparison'),
};

// === Stocks ===
export const stocksApi = {
  getAll: () => request<StockSummary[]>('/dashboard/stock-summary'),
  getByTicker: (ticker: string) => request<Stock>(`/stocks/${ticker}`),
  add: (data: { ticker: string; name: string; market: string; name_ko?: string }) =>
    request<Stock>('/stocks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (ticker: string) =>
    request<void>(`/stocks/${ticker}`, { method: 'DELETE' }),
  search: (query: string) =>
    request<StockSearchResult[]>(`/stocks/search?q=${encodeURIComponent(query)}`),
  getPrices: (ticker: string, days?: number) =>
    request<StockPrice[]>(
      `/stocks/${ticker}/prices${days ? `?days=${days}` : ''}`
    ),
  getAccuracyHistory: (ticker: string) =>
    request<AccuracyHistoryEntry[]>(`/stocks/${ticker}/accuracy-history`),
};

// === Predictions ===
export const predictionsApi = {
  getByTicker: (ticker: string, limit = 20, offset = 0, llmId?: string) =>
    request<PaginatedResponse<Prediction>>(
      `/predictions/${ticker}?limit=${limit}&offset=${offset}${llmId ? `&llm_id=${encodeURIComponent(llmId)}` : ''}`
    ),
  getComparison: (ticker: string, date: string) =>
    request<SingleLLMComparison[]>(
      `/predictions/${ticker}/comparison?date=${encodeURIComponent(date)}`
    ),
  getAllLLMs: (ticker: string, limit = 30) =>
    request<DatePredictionComparison[]>(
      `/predictions/${ticker}/all-llms?limit=${limit}`
    ),
};

// === Notes ===
export const notesApi = {
  getAll: (llmId?: string) =>
    request<Note[]>(`/notes${llmId ? `?llm_id=${encodeURIComponent(llmId)}` : ''}`),
};

// === Translate ===
export const translateApi = {
  translate: (text: string, targetLang: 'ko' | 'en') =>
    request<{ translated: string }>('/translate', {
      method: 'POST',
      body: JSON.stringify({ text, targetLang }),
    }),
};

// === Settings ===
export const settingsApi = {
  // Key-value settings
  get: <T>(key: string) => request<{ key: string; value: T }>(`/settings/${key}`),
  save: <T>(key: string, value: T) =>
    request<{ success: boolean }>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  // Legacy LLM helpers (single provider)
  testLLM: (config: { provider: string; baseUrl: string; apiKey: string; model: string }) =>
    request<{ success: boolean; message?: string }>('/settings/test-llm', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Convenience helpers for specific settings
  getGeneral: () =>
    request<{ key: string; value: GeneralSettings }>('/settings/general')
      .then(r => r.value)
      .catch(() => ({ flatThreshold: 0.3 } as GeneralSettings)),
  saveGeneral: (data: GeneralSettings) =>
    request<{ success: boolean }>('/settings/general', {
      method: 'PUT',
      body: JSON.stringify({ value: data }),
    }),
  getSchedule: () =>
    request<{ key: string; value: ScheduleSettings }>('/settings/schedule')
      .then(r => r.value)
      .catch(() => ({ predictionCron: '0 0 * * *', reviewCron: '0 20 * * *' } as ScheduleSettings)),
  saveSchedule: (data: ScheduleSettings) =>
    request<{ success: boolean }>('/settings/schedule', {
      method: 'PUT',
      body: JSON.stringify({ value: data }),
    }),
};

// === LLM Configs (Multi-LLM) ===
export const llmsApi = {
  getAll: () => request<LLMConfig[]>('/settings/llms'),
  add: (config: LLMConfig) =>
    request<LLMConfig[]>('/settings/llms', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  update: (id: string, updates: Partial<LLMConfig>) =>
    request<LLMConfig[]>(`/settings/llms/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  remove: (id: string) =>
    request<LLMConfig[]>(`/settings/llms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  test: (id: string) =>
    request<{ success: boolean; error?: string }>(
      `/settings/llms/${encodeURIComponent(id)}/test`,
      { method: 'POST' }
    ),
};
