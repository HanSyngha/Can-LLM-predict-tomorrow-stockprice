-- stocks: registered tickers
CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  api_source TEXT NOT NULL DEFAULT 'YAHOO',
  added_at DATETIME NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

-- stock_prices: price cache
CREATE TABLE IF NOT EXISTS stock_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  open_price REAL,
  close_price REAL,
  high_price REAL,
  low_price REAL,
  volume INTEGER,
  change_rate REAL,
  fetched_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_stock_prices_ticker_date ON stock_prices(ticker, date);

-- predictions: prediction records
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  prediction_date TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  direction TEXT NOT NULL CHECK(direction IN ('UP', 'DOWN', 'FLAT', 'UNABLE')),
  reasoning TEXT,
  search_queries TEXT,
  search_reports TEXT,
  tool_call_history TEXT,
  actual_direction TEXT CHECK(actual_direction IN ('UP', 'DOWN', 'FLAT') OR actual_direction IS NULL),
  actual_change_rate REAL,
  actual_close_price REAL,
  is_correct INTEGER,
  UNIQUE(ticker, prediction_date)
);

CREATE INDEX IF NOT EXISTS idx_predictions_ticker_date ON predictions(ticker, prediction_date);

-- notes: shared reflection notes (50 slots)
CREATE TABLE IF NOT EXISTS notes (
  slot_number INTEGER PRIMARY KEY CHECK(slot_number BETWEEN 1 AND 50),
  content TEXT,
  last_updated_at DATETIME,
  last_updated_by TEXT
);

-- accuracy_history: daily cumulative accuracy snapshots
CREATE TABLE IF NOT EXISTS accuracy_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  total_predictions INTEGER NOT NULL,
  total_correct INTEGER NOT NULL,
  accuracy_rate REAL NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accuracy_history_date ON accuracy_history(date);

-- settings: key-value store
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
