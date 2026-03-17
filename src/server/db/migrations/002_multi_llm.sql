-- ============================================
-- Migration 002: Multi-LLM Support
-- ============================================

-- Step 1: Recreate predictions table with llm_id and new unique constraint
CREATE TABLE IF NOT EXISTS predictions_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  llm_id TEXT NOT NULL DEFAULT 'default',
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
  UNIQUE(llm_id, ticker, prediction_date)
);

-- Migrate existing predictions data
INSERT OR IGNORE INTO predictions_v2 (
  id, llm_id, ticker, prediction_date, created_at, direction, reasoning,
  search_queries, search_reports, tool_call_history,
  actual_direction, actual_change_rate, actual_close_price, is_correct
)
SELECT
  id, 'default', ticker, prediction_date, created_at, direction, reasoning,
  search_queries, search_reports, tool_call_history,
  actual_direction, actual_change_rate, actual_close_price, is_correct
FROM predictions;

DROP TABLE IF EXISTS predictions;
ALTER TABLE predictions_v2 RENAME TO predictions;

CREATE INDEX IF NOT EXISTS idx_predictions_ticker_date ON predictions(ticker, prediction_date);
CREATE INDEX IF NOT EXISTS idx_predictions_llm_ticker_date ON predictions(llm_id, ticker, prediction_date);

-- Step 2: Recreate notes table with llm_id
CREATE TABLE IF NOT EXISTS notes_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  llm_id TEXT NOT NULL DEFAULT 'default',
  slot_number INTEGER NOT NULL CHECK(slot_number BETWEEN 1 AND 50),
  content TEXT,
  last_updated_at DATETIME,
  last_updated_by TEXT,
  UNIQUE(llm_id, slot_number)
);

INSERT OR IGNORE INTO notes_v2 (llm_id, slot_number, content, last_updated_at, last_updated_by)
  SELECT 'default', slot_number, content, last_updated_at, last_updated_by FROM notes;

DROP TABLE IF EXISTS notes;
ALTER TABLE notes_v2 RENAME TO notes;

-- Step 3: Recreate accuracy_history with llm_id
CREATE TABLE IF NOT EXISTS accuracy_history_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  total_predictions INTEGER NOT NULL,
  total_correct INTEGER NOT NULL,
  accuracy_rate REAL NOT NULL,
  llm_id TEXT NOT NULL DEFAULT 'overall',
  recorded_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, llm_id)
);

INSERT OR IGNORE INTO accuracy_history_v2 (date, total_predictions, total_correct, accuracy_rate, llm_id, recorded_at)
  SELECT date, total_predictions, total_correct, accuracy_rate, 'overall', recorded_at FROM accuracy_history;

DROP TABLE IF EXISTS accuracy_history;
ALTER TABLE accuracy_history_v2 RENAME TO accuracy_history;

CREATE INDEX IF NOT EXISTS idx_accuracy_history_date ON accuracy_history(date);
