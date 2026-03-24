-- Migration 007: Intraday hourly prediction tables
-- Adds support for hourly predictions during trading hours

-- intraday_prices: hourly price cache
CREATE TABLE IF NOT EXISTS intraday_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  datetime TEXT NOT NULL,
  price REAL,
  volume INTEGER,
  fetched_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(ticker, datetime)
);
CREATE INDEX IF NOT EXISTS idx_intraday_prices_lookup ON intraday_prices(ticker, datetime);

-- intraday_predictions: hourly predictions
CREATE TABLE IF NOT EXISTS intraday_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  llm_id TEXT NOT NULL DEFAULT 'default',
  ticker TEXT NOT NULL,
  prediction_date TEXT NOT NULL,
  prediction_hour INTEGER NOT NULL,
  prediction_minute INTEGER NOT NULL DEFAULT 0,
  target_hour INTEGER NOT NULL,
  target_minute INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  direction TEXT NOT NULL CHECK(direction IN ('UP','DOWN','FLAT','UNABLE')),
  reasoning TEXT,
  search_queries TEXT,
  search_reports TEXT,
  tool_call_history TEXT,
  reference_price REAL,
  actual_direction TEXT CHECK(actual_direction IN ('UP','DOWN','FLAT') OR actual_direction IS NULL),
  actual_change_rate REAL,
  actual_price REAL,
  is_correct INTEGER,
  reasoning_ko TEXT,
  search_reports_ko TEXT,
  UNIQUE(llm_id, ticker, prediction_date, prediction_hour, prediction_minute)
);
CREATE INDEX IF NOT EXISTS idx_intraday_preds_lookup ON intraday_predictions(ticker, prediction_date);

-- intraday_accuracy_history: cumulative accuracy snapshots for intraday
CREATE TABLE IF NOT EXISTS intraday_accuracy_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  total_predictions INTEGER NOT NULL,
  total_correct INTEGER NOT NULL,
  accuracy_rate REAL NOT NULL,
  llm_id TEXT NOT NULL DEFAULT 'overall',
  recorded_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(date, llm_id)
);

-- intraday_notes: per-LLM notes for intraday patterns (50 slots)
CREATE TABLE IF NOT EXISTS intraday_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  llm_id TEXT NOT NULL DEFAULT 'default',
  slot_number INTEGER NOT NULL CHECK(slot_number BETWEEN 1 AND 50),
  content TEXT,
  content_ko TEXT,
  last_updated_at DATETIME,
  last_updated_by TEXT,
  UNIQUE(llm_id, slot_number)
);
