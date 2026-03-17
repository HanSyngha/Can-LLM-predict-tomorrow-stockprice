-- Translation cache table
CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(source_hash, target_lang)
);
