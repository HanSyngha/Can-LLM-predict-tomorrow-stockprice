import { getDb } from './database.js';
import type {
  Stock, NewStock, StockPrice, NewStockPrice,
  Prediction, NewPrediction, ActualResult,
  Note, AccuracyHistoryEntry, AccuracyStats,
  StockSummary, DashboardSummary, LLMConfig,
  LLMAccuracySummary, IntradayPrediction,
} from '../types/index.js';

// === Stocks ===

export function getActiveStocks(): Stock[] {
  return getDb().prepare('SELECT * FROM stocks WHERE is_active = 1 ORDER BY added_at ASC').all() as Stock[];
}

export function getStockByTicker(ticker: string): Stock | undefined {
  return getDb().prepare('SELECT * FROM stocks WHERE ticker = ?').get(ticker) as Stock | undefined;
}

export function addStock(stock: NewStock): Stock {
  const stmt = getDb().prepare(
    'INSERT INTO stocks (ticker, name, name_ko, market, api_source) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(stock.ticker, stock.name, stock.name_ko ?? null, stock.market, stock.api_source);
  return getDb().prepare('SELECT * FROM stocks WHERE id = ?').get(result.lastInsertRowid) as Stock;
}

export function deactivateStock(ticker: string): void {
  const db = getDb();
  db.prepare('DELETE FROM stock_prices WHERE ticker = ?').run(ticker);
  db.prepare('DELETE FROM predictions WHERE ticker = ?').run(ticker);
  db.prepare('DELETE FROM stocks WHERE ticker = ?').run(ticker);
}

// === Stock Prices ===

export function getPrice(ticker: string, date: string): StockPrice | undefined {
  return getDb().prepare(
    'SELECT * FROM stock_prices WHERE ticker = ? AND date = ?'
  ).get(ticker, date) as StockPrice | undefined;
}

export function getPriceRange(ticker: string, startDate: string, endDate: string): StockPrice[] {
  return getDb().prepare(
    'SELECT * FROM stock_prices WHERE ticker = ? AND date BETWEEN ? AND ? ORDER BY date ASC'
  ).all(ticker, startDate, endDate) as StockPrice[];
}

export function upsertPrice(price: NewStockPrice): void {
  getDb().prepare(`
    INSERT INTO stock_prices (ticker, date, open_price, close_price, high_price, low_price, volume, change_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ticker, date) DO UPDATE SET
      open_price = excluded.open_price,
      close_price = excluded.close_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      volume = excluded.volume,
      change_rate = excluded.change_rate,
      fetched_at = excluded.fetched_at
  `).run(
    price.ticker, price.date,
    price.open_price ?? null, price.close_price ?? null,
    price.high_price ?? null, price.low_price ?? null,
    price.volume ?? null, price.change_rate ?? null
  );
}

export function upsertPrices(prices: NewStockPrice[]): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO stock_prices (ticker, date, open_price, close_price, high_price, low_price, volume, change_rate, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ticker, date) DO UPDATE SET
      open_price = excluded.open_price,
      close_price = excluded.close_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      volume = excluded.volume,
      change_rate = excluded.change_rate,
      fetched_at = excluded.fetched_at
  `);

  const insertMany = db.transaction(() => {
    for (const p of prices) {
      insert.run(
        p.ticker, p.date,
        p.open_price ?? null, p.close_price ?? null,
        p.high_price ?? null, p.low_price ?? null,
        p.volume ?? null, p.change_rate ?? null
      );
    }
  });

  insertMany();
}

export function getCachedDates(ticker: string, startDate: string, endDate: string): Set<string> {
  const rows = getDb().prepare(
    'SELECT date FROM stock_prices WHERE ticker = ? AND date BETWEEN ? AND ?'
  ).all(ticker, startDate, endDate) as { date: string }[];
  return new Set(rows.map(r => r.date));
}

// === Predictions ===

export function createPrediction(pred: NewPrediction): Prediction {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO predictions (llm_id, ticker, prediction_date, direction, reasoning, search_queries, search_reports, tool_call_history)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    pred.llm_id, pred.ticker, pred.prediction_date, pred.direction,
    pred.reasoning ?? null, pred.search_queries ?? null,
    pred.search_reports ?? null, pred.tool_call_history ?? null
  );
  return getDb().prepare('SELECT * FROM predictions WHERE id = ?').get(result.lastInsertRowid) as Prediction;
}

export function getPrediction(ticker: string, date: string, llmId?: string): Prediction | undefined {
  if (llmId) {
    return getDb().prepare(
      'SELECT * FROM predictions WHERE ticker = ? AND prediction_date = ? AND llm_id = ?'
    ).get(ticker, date, llmId) as Prediction | undefined;
  }
  return getDb().prepare(
    'SELECT * FROM predictions WHERE ticker = ? AND prediction_date = ?'
  ).get(ticker, date) as Prediction | undefined;
}

export function updatePredictionTranslations(id: number, reasoningKo: string | null, searchReportsKo: string | null): void {
  getDb().prepare(
    'UPDATE predictions SET reasoning_ko = ?, search_reports_ko = ? WHERE id = ?'
  ).run(reasoningKo, searchReportsKo, id);
}

export function getRecentPredictions(ticker: string, limit: number = 30, llmId?: string): Prediction[] {
  if (llmId) {
    return getDb().prepare(
      'SELECT * FROM predictions WHERE ticker = ? AND llm_id = ? ORDER BY prediction_date DESC LIMIT ?'
    ).all(ticker, llmId, limit) as Prediction[];
  }
  return getDb().prepare(
    'SELECT * FROM predictions WHERE ticker = ? ORDER BY prediction_date DESC LIMIT ?'
  ).all(ticker, limit) as Prediction[];
}

export function getPredictionsPaginated(ticker: string, limit: number, offset: number, llmId?: string): { items: Prediction[]; total: number } {
  if (llmId) {
    const items = getDb().prepare(
      'SELECT * FROM predictions WHERE ticker = ? AND llm_id = ? ORDER BY prediction_date DESC LIMIT ? OFFSET ?'
    ).all(ticker, llmId, limit, offset) as Prediction[];

    const { count } = getDb().prepare(
      'SELECT COUNT(*) as count FROM predictions WHERE ticker = ? AND llm_id = ?'
    ).get(ticker, llmId) as { count: number };

    return { items, total: count };
  }

  const items = getDb().prepare(
    'SELECT * FROM predictions WHERE ticker = ? ORDER BY prediction_date DESC LIMIT ? OFFSET ?'
  ).all(ticker, limit, offset) as Prediction[];

  const { count } = getDb().prepare(
    'SELECT COUNT(*) as count FROM predictions WHERE ticker = ?'
  ).get(ticker) as { count: number };

  return { items, total: count };
}

export function updatePredictionResult(ticker: string, date: string, actual: ActualResult, llmId?: string): void {
  if (llmId) {
    getDb().prepare(`
      UPDATE predictions SET
        actual_direction = ?,
        actual_change_rate = ?,
        actual_close_price = ?,
        is_correct = ?
      WHERE ticker = ? AND prediction_date = ? AND llm_id = ?
    `).run(
      actual.actual_direction, actual.actual_change_rate,
      actual.actual_close_price, actual.is_correct,
      ticker, date, llmId
    );
  } else {
    getDb().prepare(`
      UPDATE predictions SET
        actual_direction = ?,
        actual_change_rate = ?,
        actual_close_price = ?,
        is_correct = ?
      WHERE ticker = ? AND prediction_date = ?
    `).run(
      actual.actual_direction, actual.actual_change_rate,
      actual.actual_close_price, actual.is_correct,
      ticker, date
    );
  }
}

export function getUnresolvedPredictions(): Prediction[] {
  return getDb().prepare(
    'SELECT * FROM predictions WHERE actual_direction IS NULL AND direction != \'UNABLE\' ORDER BY prediction_date ASC LIMIT 500'
  ).all() as Prediction[];
}

// === Notes (per-LLM) ===

export function getAllNotes(llmId: string = 'default'): Note[] {
  return getDb().prepare('SELECT * FROM notes WHERE llm_id = ? ORDER BY slot_number ASC').all(llmId) as Note[];
}

export function getNonEmptyNotes(llmId: string = 'default'): Note[] {
  return getDb().prepare(
    'SELECT * FROM notes WHERE llm_id = ? AND content IS NOT NULL AND content != \'\' ORDER BY slot_number ASC'
  ).all(llmId) as Note[];
}

export function updateNote(slotNumber: number, content: string, updatedBy: string, llmId: string = 'default'): void {
  getDb().prepare(`
    UPDATE notes SET content = ?, last_updated_at = datetime('now'), last_updated_by = ?
    WHERE llm_id = ? AND slot_number = ?
  `).run(content, updatedBy, llmId, slotNumber);
}

/**
 * Ensure 50 note slots exist for a given LLM.
 */
export function ensureNoteSlots(llmId: string): void {
  const db = getDb();
  const existingCount = db
    .prepare('SELECT COUNT(*) as count FROM notes WHERE llm_id = ?')
    .get(llmId) as { count: number };

  if (existingCount.count === 0) {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO notes (llm_id, slot_number, content) VALUES (?, ?, NULL)'
    );
    const insertAll = db.transaction(() => {
      for (let i = 1; i <= 50; i++) {
        insert.run(llmId, i);
      }
    });
    insertAll();
  }
}

// === LLM Configs ===

export function getLLMConfigs(): LLMConfig[] {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('llm_configs') as { value: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.value) as LLMConfig[];
  } catch {
    return [];
  }
}

export function getActiveLLMConfigs(): LLMConfig[] {
  return getLLMConfigs().filter(c => c.isActive);
}

export function getLLMConfig(id: string): LLMConfig | undefined {
  return getLLMConfigs().find(c => c.id === id);
}

export function setLLMConfigs(configs: LLMConfig[]): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run('llm_configs', JSON.stringify(configs));
}

export function addLLMConfig(config: LLMConfig): LLMConfig[] {
  const configs = getLLMConfigs();
  if (configs.length >= 5) {
    throw new Error('Maximum 5 LLM configs allowed');
  }
  if (configs.find(c => c.id === config.id)) {
    throw new Error(`LLM config with id "${config.id}" already exists`);
  }
  configs.push(config);
  setLLMConfigs(configs);
  // Ensure note slots exist for this new LLM
  ensureNoteSlots(config.id);
  return configs;
}

export function updateLLMConfig(id: string, updates: Partial<LLMConfig>): LLMConfig[] {
  const configs = getLLMConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx === -1) {
    throw new Error(`LLM config "${id}" not found`);
  }
  configs[idx] = { ...configs[idx]!, ...updates, id }; // id cannot change
  setLLMConfigs(configs);
  return configs;
}

export function deleteLLMConfig(id: string): LLMConfig[] {
  // Only remove the config - keep all predictions, notes, and accuracy history
  // If this LLM is re-added later with the same ID, its historical data will be preserved
  let configs = getLLMConfigs();
  configs = configs.filter(c => c.id !== id);
  setLLMConfigs(configs);
  return configs;
}

// === Accuracy ===

export function getAccuracyStats(ticker?: string, llmId?: string): AccuracyStats {
  let where = "WHERE direction != 'UNABLE'";
  const params: unknown[] = [];

  if (ticker) {
    where += ' AND ticker = ?';
    params.push(ticker);
  }
  if (llmId) {
    where += ' AND llm_id = ?';
    params.push(llmId);
  }

  const row = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as incorrect
    FROM predictions
    ${where} AND actual_direction IS NOT NULL
  `).get(...params) as { total: number; correct: number; incorrect: number };

  let unableWhere = "WHERE direction = 'UNABLE'";
  const unableParams: unknown[] = [];
  if (ticker) {
    unableWhere += ' AND ticker = ?';
    unableParams.push(ticker);
  }
  if (llmId) {
    unableWhere += ' AND llm_id = ?';
    unableParams.push(llmId);
  }

  const unable = getDb().prepare(
    `SELECT COUNT(*) as count FROM predictions ${unableWhere}`
  ).get(...unableParams) as { count: number };

  return {
    total: row.total,
    correct: row.correct ?? 0,
    incorrect: row.incorrect ?? 0,
    unable: unable.count,
    rate: row.total > 0 ? (row.correct / row.total) * 100 : 0,
  };
}

export function recordAccuracySnapshot(date: string, stats: AccuracyStats, llmId: string = 'overall'): void {
  getDb().prepare(`
    INSERT INTO accuracy_history (date, total_predictions, total_correct, accuracy_rate, llm_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date, llm_id) DO UPDATE SET
      total_predictions = excluded.total_predictions,
      total_correct = excluded.total_correct,
      accuracy_rate = excluded.accuracy_rate,
      recorded_at = datetime('now')
  `).run(date, stats.total, stats.correct, stats.rate, llmId);
}

export function getAccuracyHistory(limit?: number, llmId?: string): AccuracyHistoryEntry[] {
  // Exclude weekends (strftime %w: 0=Sun, 6=Sat)
  const weekdayFilter = "strftime('%w', date) NOT IN ('0','6')";

  if (llmId) {
    const sql = limit
      ? `SELECT * FROM accuracy_history WHERE llm_id = ? AND ${weekdayFilter} ORDER BY date DESC LIMIT ?`
      : `SELECT * FROM accuracy_history WHERE llm_id = ? AND ${weekdayFilter} ORDER BY date ASC`;
    return (limit
      ? getDb().prepare(sql).all(llmId, limit)
      : getDb().prepare(sql).all(llmId)) as AccuracyHistoryEntry[];
  }

  const sql = limit
    ? `SELECT * FROM accuracy_history WHERE ${weekdayFilter} ORDER BY date DESC LIMIT ?`
    : `SELECT * FROM accuracy_history WHERE ${weekdayFilter} ORDER BY date ASC`;
  return (limit
    ? getDb().prepare(sql).all(limit)
    : getDb().prepare(sql).all()) as AccuracyHistoryEntry[];
}

export function getStockAccuracyHistory(ticker: string, llmId?: string): AccuracyHistoryEntry[] {
  if (llmId) {
    return getDb().prepare(`
      SELECT
        prediction_date as date,
        (SELECT COUNT(*) FROM predictions p2
          WHERE p2.ticker = ? AND p2.llm_id = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
          AND p2.prediction_date <= predictions.prediction_date) as total_predictions,
        (SELECT SUM(CASE WHEN p2.is_correct = 1 THEN 1 ELSE 0 END) FROM predictions p2
          WHERE p2.ticker = ? AND p2.llm_id = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
          AND p2.prediction_date <= predictions.prediction_date) as total_correct,
        CASE
          WHEN (SELECT COUNT(*) FROM predictions p2
            WHERE p2.ticker = ? AND p2.llm_id = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
            AND p2.prediction_date <= predictions.prediction_date) > 0
          THEN ROUND(
            (SELECT SUM(CASE WHEN p2.is_correct = 1 THEN 1.0 ELSE 0 END) FROM predictions p2
              WHERE p2.ticker = ? AND p2.llm_id = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
              AND p2.prediction_date <= predictions.prediction_date)
            * 100.0
            / (SELECT COUNT(*) FROM predictions p2
              WHERE p2.ticker = ? AND p2.llm_id = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
              AND p2.prediction_date <= predictions.prediction_date),
            2)
          ELSE 0
        END as accuracy_rate,
        datetime('now') as recorded_at
      FROM predictions
      WHERE ticker = ? AND llm_id = ? AND direction != 'UNABLE' AND actual_direction IS NOT NULL
      ORDER BY prediction_date ASC
    `).all(ticker, llmId, ticker, llmId, ticker, llmId, ticker, llmId, ticker, llmId, ticker, llmId) as AccuracyHistoryEntry[];
  }

  // Build per-stock accuracy over time from predictions (all LLMs combined)
  return getDb().prepare(`
    SELECT
      prediction_date as date,
      (SELECT COUNT(*) FROM predictions p2
        WHERE p2.ticker = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
        AND p2.prediction_date <= predictions.prediction_date) as total_predictions,
      (SELECT SUM(CASE WHEN p2.is_correct = 1 THEN 1 ELSE 0 END) FROM predictions p2
        WHERE p2.ticker = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
        AND p2.prediction_date <= predictions.prediction_date) as total_correct,
      CASE
        WHEN (SELECT COUNT(*) FROM predictions p2
          WHERE p2.ticker = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
          AND p2.prediction_date <= predictions.prediction_date) > 0
        THEN ROUND(
          (SELECT SUM(CASE WHEN p2.is_correct = 1 THEN 1.0 ELSE 0 END) FROM predictions p2
            WHERE p2.ticker = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
            AND p2.prediction_date <= predictions.prediction_date)
          * 100.0
          / (SELECT COUNT(*) FROM predictions p2
            WHERE p2.ticker = ? AND p2.direction != 'UNABLE' AND p2.actual_direction IS NOT NULL
            AND p2.prediction_date <= predictions.prediction_date),
          2)
        ELSE 0
      END as accuracy_rate,
      datetime('now') as recorded_at
    FROM predictions
    WHERE ticker = ? AND direction != 'UNABLE' AND actual_direction IS NOT NULL
    ORDER BY prediction_date ASC
  `).all(ticker, ticker, ticker, ticker, ticker, ticker) as AccuracyHistoryEntry[];
}

// === Settings ===

export function getSetting<T>(key: string): T | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSetting<T>(key: string, value: T): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

export function getAllSettings(): Record<string, unknown> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

// === Translations ===

export function getCachedTranslation(sourceHash: string, targetLang: string): string | null {
  const row = getDb().prepare(
    'SELECT translated_text FROM translations WHERE source_hash = ? AND target_lang = ?'
  ).get(sourceHash, targetLang) as { translated_text: string } | undefined;
  return row?.translated_text ?? null;
}

export function cacheTranslation(sourceHash: string, targetLang: string, translatedText: string): void {
  getDb().prepare(`
    INSERT INTO translations (source_hash, target_lang, translated_text)
    VALUES (?, ?, ?)
    ON CONFLICT(source_hash, target_lang) DO UPDATE SET
      translated_text = excluded.translated_text,
      created_at = datetime('now')
  `).run(sourceHash, targetLang, translatedText);
}

// === Predictions (all LLMs comparison) ===

export function getPredictionComparison(ticker: string, date: string): Array<{
  llm_id: string;
  llm_name: string;
  direction: string;
  reasoning: string | null;
  is_correct: number | null;
}> {
  const configs = getLLMConfigs();
  const configMap = new Map(configs.map(c => [c.id, c]));

  const rows = getDb().prepare(
    'SELECT llm_id, direction, reasoning, is_correct FROM predictions WHERE ticker = ? AND prediction_date = ?'
  ).all(ticker, date) as Array<{ llm_id: string; direction: string; reasoning: string | null; is_correct: number | null }>;

  return rows.map(r => ({
    ...r,
    llm_name: configMap.get(r.llm_id)?.name || r.llm_id,
  }));
}

export function getAllLLMsPredictions(ticker: string, limit: number = 30): Array<{
  date: string;
  actual_direction: string | null;
  actual_change_rate: number | null;
  actual_close_price: number | null;
  predictions: Array<{
    llm_id: string;
    llm_name: string;
    direction: string;
    is_correct: number | null;
    reasoning: string | null;
  }>;
}> {
  const configs = getLLMConfigs();
  const configMap = new Map(configs.map(c => [c.id, c]));

  // Get distinct dates
  const dates = getDb().prepare(
    'SELECT DISTINCT prediction_date FROM predictions WHERE ticker = ? ORDER BY prediction_date DESC LIMIT ?'
  ).all(ticker, limit) as Array<{ prediction_date: string }>;

  return dates.map(({ prediction_date }) => {
    const preds = getDb().prepare(
      'SELECT llm_id, direction, reasoning, is_correct, actual_direction, actual_change_rate, actual_close_price FROM predictions WHERE ticker = ? AND prediction_date = ?'
    ).all(ticker, prediction_date) as Array<{
      llm_id: string; direction: string; reasoning: string | null;
      is_correct: number | null; actual_direction: string | null;
      actual_change_rate: number | null; actual_close_price: number | null;
    }>;

    // Use the first prediction's actual values (they should be the same for all LLMs on the same date)
    const first = preds[0];
    return {
      date: prediction_date,
      actual_direction: first?.actual_direction ?? null,
      actual_change_rate: first?.actual_change_rate ?? null,
      actual_close_price: first?.actual_close_price ?? null,
      predictions: preds.map(p => ({
        llm_id: p.llm_id,
        llm_name: configMap.get(p.llm_id)?.name || p.llm_id,
        direction: p.direction,
        is_correct: p.is_correct,
        reasoning: p.reasoning,
      })),
    };
  });
}

// === Dashboard ===

export function getDashboardSummary(): DashboardSummary {
  const stats = getAccuracyStats();
  const { count: stockCount } = getDb().prepare(
    'SELECT COUNT(*) as count FROM stocks WHERE is_active = 1'
  ).get() as { count: number };

  // Per-LLM accuracy
  const llmConfigs = getLLMConfigs();
  const llmAccuracies: LLMAccuracySummary[] = llmConfigs
    .filter(c => c.isActive)
    .map(config => {
      const llmStats = getAccuracyStats(undefined, config.id);
      return {
        llmId: config.id,
        llmName: config.name,
        accuracy: llmStats.rate,
        totalPredictions: llmStats.total,
        totalCorrect: llmStats.correct,
      };
    });

  return {
    overallAccuracy: stats.rate,
    totalPredictions: stats.total,
    totalCorrect: stats.correct,
    stockCount,
    llmAccuracies,
  };
}

export function getStockSummaries(): StockSummary[] {
  const stocks = getActiveStocks();
  return stocks.map(stock => {
    const stats = getAccuracyStats(stock.ticker);

    // Get latest prediction date
    const latestDate = getDb().prepare(
      'SELECT prediction_date FROM predictions WHERE ticker = ? ORDER BY prediction_date DESC LIMIT 1'
    ).get(stock.ticker) as { prediction_date: string } | undefined;

    let lastPrediction: { direction: string; is_correct: number | null; prediction_date: string } | null = null;

    if (latestDate) {
      // Get ALL LLM predictions for that date → majority vote
      const preds = getDb().prepare(
        "SELECT direction, is_correct FROM predictions WHERE ticker = ? AND prediction_date = ? AND direction != 'UNABLE'"
      ).all(stock.ticker, latestDate.prediction_date) as Array<{ direction: string; is_correct: number | null }>;

      if (preds.length > 0) {
        const counts: Record<string, number> = {};
        for (const p of preds) {
          counts[p.direction] = (counts[p.direction] || 0) + 1;
        }
        // Pick direction with most votes
        const majorityDir = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
        // is_correct: check if majority direction matches any resolved prediction
        const resolved = preds.find(p => p.is_correct !== null && p.direction === majorityDir);
        lastPrediction = {
          direction: majorityDir,
          is_correct: resolved?.is_correct ?? null,
          prediction_date: latestDate.prediction_date,
        };
      }
    }

    const latestPrice = getDb().prepare(
      'SELECT close_price, change_rate FROM stock_prices WHERE ticker = ? ORDER BY date DESC LIMIT 1'
    ).get(stock.ticker) as { close_price: number; change_rate: number } | undefined;

    return {
      ...stock,
      currentPrice: latestPrice?.close_price ?? null,
      changeRate: latestPrice?.change_rate ?? null,
      accuracy: stats.rate,
      totalPredictions: stats.total,
      lastPrediction: lastPrediction as any,
    };
  });
}

// === Intraday DAL Functions ===

export function upsertIntradayPrices(prices: Array<{ ticker: string; datetime: string; price: number | null; volume?: number | null }>): void {
  const stmt = getDb().prepare(`
    INSERT INTO intraday_prices (ticker, datetime, price, volume)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(ticker, datetime) DO UPDATE SET
      price = excluded.price,
      volume = excluded.volume,
      fetched_at = datetime('now')
  `);
  const insertAll = getDb().transaction(() => {
    for (const p of prices) {
      stmt.run(p.ticker, p.datetime, p.price, p.volume ?? null);
    }
  });
  insertAll();
}

export function getRecentIntradayPrices(ticker: string, limit: number = 100): Array<{ id: number; ticker: string; datetime: string; price: number | null; volume: number | null; fetched_at: string }> {
  return getDb().prepare(
    'SELECT * FROM intraday_prices WHERE ticker = ? ORDER BY datetime DESC LIMIT ?'
  ).all(ticker, limit) as Array<{ id: number; ticker: string; datetime: string; price: number | null; volume: number | null; fetched_at: string }>;
}

export function getFilteredIntradayPrices(ticker: string, market: string, limit: number = 100): Array<{ datetime: string; price: number | null }> {
  // For KOSPI/KOSDAQ: prices at :00 (top of hour)
  // For NASDAQ: prices at :30
  const minuteFilter = (market === 'KOSPI' || market === 'KOSDAQ') ? '00' : '30';
  return getDb().prepare(`
    SELECT datetime, price FROM intraday_prices
    WHERE ticker = ? AND substr(datetime, 15, 2) = ?
    ORDER BY datetime DESC LIMIT ?
  `).all(ticker, minuteFilter, limit) as Array<{ datetime: string; price: number | null }>;
}

export function createIntradayPrediction(pred: {
  llm_id: string; ticker: string; prediction_date: string;
  prediction_hour: number; prediction_minute: number;
  target_hour: number; target_minute: number;
  direction: string; reference_price?: number | null;
  reasoning?: string | null; search_queries?: string | null;
  search_reports?: string | null; tool_call_history?: string | null;
}): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO intraday_predictions
    (llm_id, ticker, prediction_date, prediction_hour, prediction_minute,
     target_hour, target_minute, direction, reference_price,
     reasoning, search_queries, search_reports, tool_call_history)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pred.llm_id, pred.ticker, pred.prediction_date,
    pred.prediction_hour, pred.prediction_minute,
    pred.target_hour, pred.target_minute,
    pred.direction, pred.reference_price ?? null,
    pred.reasoning ?? null, pred.search_queries ?? null,
    pred.search_reports ?? null, pred.tool_call_history ?? null
  );
}

export function getIntradayPrediction(
  ticker: string, date: string, hour: number, minute: number, llmId: string
): IntradayPrediction | undefined {
  return getDb().prepare(`
    SELECT * FROM intraday_predictions
    WHERE ticker = ? AND prediction_date = ? AND prediction_hour = ? AND prediction_minute = ? AND llm_id = ?
  `).get(ticker, date, hour, minute, llmId) as IntradayPrediction | undefined;
}

export function getIntradayPredictionsForDate(
  ticker: string, date: string, llmId?: string
): IntradayPrediction[] {
  if (llmId) {
    return getDb().prepare(
      'SELECT * FROM intraday_predictions WHERE ticker = ? AND prediction_date = ? AND llm_id = ? ORDER BY prediction_hour, prediction_minute'
    ).all(ticker, date, llmId) as IntradayPrediction[];
  }
  return getDb().prepare(
    'SELECT * FROM intraday_predictions WHERE ticker = ? AND prediction_date = ? ORDER BY prediction_hour, prediction_minute'
  ).all(ticker, date) as IntradayPrediction[];
}

export function getAllIntradayPredictionsForDate(date: string): IntradayPrediction[] {
  return getDb().prepare(
    'SELECT * FROM intraday_predictions WHERE prediction_date = ? ORDER BY ticker, prediction_hour, prediction_minute'
  ).all(date) as IntradayPrediction[];
}

export function getUnresolvedIntradayPredictions(ticker: string, date?: string): IntradayPrediction[] {
  if (date) {
    return getDb().prepare(`
      SELECT * FROM intraday_predictions
      WHERE ticker = ? AND prediction_date = ? AND actual_direction IS NULL AND direction != 'UNABLE'
      ORDER BY prediction_date, prediction_hour, prediction_minute
    `).all(ticker, date) as IntradayPrediction[];
  }
  return getDb().prepare(`
    SELECT * FROM intraday_predictions
    WHERE ticker = ? AND actual_direction IS NULL AND direction != 'UNABLE'
    ORDER BY prediction_date, prediction_hour, prediction_minute
  `).all(ticker) as IntradayPrediction[];
}

export function updateIntradayPredictionResult(
  id: number,
  actual: { actual_direction: string; actual_change_rate: number; actual_price: number; is_correct: number | null }
): void {
  getDb().prepare(`
    UPDATE intraday_predictions
    SET actual_direction = ?, actual_change_rate = ?, actual_price = ?, is_correct = ?
    WHERE id = ?
  `).run(actual.actual_direction, actual.actual_change_rate, actual.actual_price, actual.is_correct, id);
}

export function getIntradayAccuracyStats(ticker?: string, llmId?: string): AccuracyStats {
  let where = "WHERE direction != 'UNABLE'";
  const params: unknown[] = [];
  if (ticker) { where += ' AND ticker = ?'; params.push(ticker); }
  if (llmId) { where += ' AND llm_id = ?'; params.push(llmId); }

  const row = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as incorrect
    FROM intraday_predictions
    ${where} AND actual_direction IS NOT NULL
  `).get(...params) as { total: number; correct: number; incorrect: number };

  let unableWhere = "WHERE direction = 'UNABLE'";
  const unableParams: unknown[] = [];
  if (ticker) { unableWhere += ' AND ticker = ?'; unableParams.push(ticker); }
  if (llmId) { unableWhere += ' AND llm_id = ?'; unableParams.push(llmId); }

  const unable = getDb().prepare(
    `SELECT COUNT(*) as count FROM intraday_predictions ${unableWhere}`
  ).get(...unableParams) as { count: number };

  return {
    total: row.total,
    correct: row.correct ?? 0,
    incorrect: row.incorrect ?? 0,
    unable: unable.count,
    rate: row.total > 0 ? (row.correct / row.total) * 100 : 0,
  };
}

export function recordIntradayAccuracySnapshot(date: string, stats: AccuracyStats, llmId: string = 'overall'): void {
  getDb().prepare(`
    INSERT INTO intraday_accuracy_history (date, total_predictions, total_correct, accuracy_rate, llm_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date, llm_id) DO UPDATE SET
      total_predictions = excluded.total_predictions,
      total_correct = excluded.total_correct,
      accuracy_rate = excluded.accuracy_rate,
      recorded_at = datetime('now')
  `).run(date, stats.total, stats.correct, stats.rate, llmId);
}

export function getIntradayAccuracyHistory(limit?: number, llmId?: string): AccuracyHistoryEntry[] {
  const weekdayFilter = "strftime('%w', date) NOT IN ('0','6')";
  if (llmId) {
    const sql = limit
      ? `SELECT * FROM intraday_accuracy_history WHERE llm_id = ? AND ${weekdayFilter} ORDER BY date DESC LIMIT ?`
      : `SELECT * FROM intraday_accuracy_history WHERE llm_id = ? AND ${weekdayFilter} ORDER BY date ASC`;
    return (limit
      ? getDb().prepare(sql).all(llmId, limit)
      : getDb().prepare(sql).all(llmId)) as AccuracyHistoryEntry[];
  }
  const sql = limit
    ? `SELECT * FROM intraday_accuracy_history WHERE ${weekdayFilter} ORDER BY date DESC LIMIT ?`
    : `SELECT * FROM intraday_accuracy_history WHERE ${weekdayFilter} ORDER BY date ASC`;
  return (limit
    ? getDb().prepare(sql).all(limit)
    : getDb().prepare(sql).all()) as AccuracyHistoryEntry[];
}

export function getIntradayTodayStats(date: string): { total: number; correct: number } {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
    FROM intraday_predictions
    WHERE prediction_date = ? AND direction != 'UNABLE' AND actual_direction IS NOT NULL
  `).get(date) as { total: number; correct: number };
  return { total: row.total, correct: row.correct ?? 0 };
}

// === Intraday Notes ===

export function getAllIntradayNotes(llmId: string): Note[] {
  return getDb().prepare(
    'SELECT * FROM intraday_notes WHERE llm_id = ? ORDER BY slot_number'
  ).all(llmId) as Note[];
}

export function getNonEmptyIntradayNotes(llmId: string): Note[] {
  return getDb().prepare(
    "SELECT * FROM intraday_notes WHERE llm_id = ? AND content IS NOT NULL AND content != '' ORDER BY slot_number"
  ).all(llmId) as Note[];
}

export function updateIntradayNote(slotNumber: number, content: string, updatedBy: string, llmId: string): void {
  getDb().prepare(`
    UPDATE intraday_notes SET content = ?, last_updated_at = datetime('now'), last_updated_by = ?
    WHERE llm_id = ? AND slot_number = ?
  `).run(content, updatedBy, llmId, slotNumber);
}

export function ensureIntradayNoteSlots(llmId: string): void {
  const count = getDb().prepare(
    'SELECT COUNT(*) as count FROM intraday_notes WHERE llm_id = ?'
  ).get(llmId) as { count: number };
  if (count.count === 0) {
    const insert = getDb().prepare(
      'INSERT OR IGNORE INTO intraday_notes (llm_id, slot_number, content) VALUES (?, ?, NULL)'
    );
    for (let i = 1; i <= 50; i++) {
      insert.run(llmId, i);
    }
  }
}

export function updateIntradayPredictionTranslations(id: number, reasoningKo: string | null, searchReportsKo: string | null): void {
  getDb().prepare(
    'UPDATE intraday_predictions SET reasoning_ko = ?, search_reports_ko = ? WHERE id = ?'
  ).run(reasoningKo, searchReportsKo, id);
}

export function getRecentIntradayPredictions(ticker: string, limit: number, llmId?: string): IntradayPrediction[] {
  if (llmId) {
    return getDb().prepare(
      'SELECT * FROM intraday_predictions WHERE ticker = ? AND llm_id = ? ORDER BY prediction_date DESC, prediction_hour DESC, prediction_minute DESC LIMIT ?'
    ).all(ticker, llmId, limit) as IntradayPrediction[];
  }
  return getDb().prepare(
    'SELECT * FROM intraday_predictions WHERE ticker = ? ORDER BY prediction_date DESC, prediction_hour DESC, prediction_minute DESC LIMIT ?'
  ).all(ticker, limit) as IntradayPrediction[];
}
