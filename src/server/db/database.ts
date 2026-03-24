import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import type { LLMConfig } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  const dbPath = process.env.DB_PATH || './data/stock-evolving.db';
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    logger.info(`Created data directory: ${dbDir}`);
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  logger.info(`Database initialized at ${dbPath}`);

  runMigrations(db);
  seedNotes(db);
  seedIntradayNotes(db);

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function runMigrations(database: Database.Database): void {
  const migrationsDir = join(__dirname, 'migrations');

  if (!existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found: ${migrationsDir}`);
    return;
  }

  // Read and execute migration files in order
  const migrationFiles = ['001_initial_schema.sql', '002_multi_llm.sql', '003_name_ko.sql', '004_translations.sql', '005_auto_translate.sql', '006_note_translations.sql', '007_intraday.sql'];

  for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);
    if (!existsSync(filePath)) {
      logger.warn(`Migration file not found: ${filePath}`);
      continue;
    }

    const sql = readFileSync(filePath, 'utf-8');
    try {
      database.exec(sql);
      logger.info(`Migration applied: ${file}`);
    } catch (error) {
      // Migrations are idempotent; ALTER TABLE may fail if column already exists
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('duplicate column name') || msg.includes('already exists')) {
        logger.debug(`Migration already applied: ${file} (${msg})`);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Seed 50 note slots for each active LLM config.
 */
function seedNotes(database: Database.Database): void {
  // Get LLM configs
  const configsRow = database
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('llm_configs') as { value: string } | undefined;

  let llmIds = ['default'];
  if (configsRow) {
    try {
      const configs = JSON.parse(configsRow.value) as LLMConfig[];
      llmIds = configs.map(c => c.id);
    } catch {
      // fallback to default
    }
  }

  const insert = database.prepare(
    'INSERT OR IGNORE INTO notes (llm_id, slot_number, content) VALUES (?, ?, NULL)'
  );

  const seedAll = database.transaction(() => {
    for (const llmId of llmIds) {
      const existingCount = database
        .prepare('SELECT COUNT(*) as count FROM notes WHERE llm_id = ?')
        .get(llmId) as { count: number };

      if (existingCount.count === 0) {
        for (let i = 1; i <= 50; i++) {
          insert.run(llmId, i);
        }
        logger.info(`Seeded 50 note slots for LLM: ${llmId}`);
      }
    }
  });

  seedAll();
}

/**
 * Seed 50 intraday note slots for each active LLM config.
 */
function seedIntradayNotes(database: Database.Database): void {
  const configsRow = database
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('llm_configs') as { value: string } | undefined;

  let llmIds = ['default'];
  if (configsRow) {
    try {
      const configs = JSON.parse(configsRow.value) as LLMConfig[];
      llmIds = configs.map(c => c.id);
    } catch {
      // fallback to default
    }
  }

  const insert = database.prepare(
    'INSERT OR IGNORE INTO intraday_notes (llm_id, slot_number, content) VALUES (?, ?, NULL)'
  );

  const seedAll = database.transaction(() => {
    for (const llmId of llmIds) {
      const existingCount = database
        .prepare('SELECT COUNT(*) as count FROM intraday_notes WHERE llm_id = ?')
        .get(llmId) as { count: number };

      if (existingCount.count === 0) {
        for (let i = 1; i <= 50; i++) {
          insert.run(llmId, i);
        }
        logger.info(`Seeded 50 intraday note slots for LLM: ${llmId}`);
      }
    }
  });

  seedAll();
}
