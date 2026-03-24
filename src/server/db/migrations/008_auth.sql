-- Users table (SSO login records)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loginid TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  deptname TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Access logs (page visit tracking)
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loginid TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  ip TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_access_logs_loginid ON access_logs(loginid);
CREATE INDEX IF NOT EXISTS idx_access_logs_created ON access_logs(created_at);

-- Set syngha.han as admin
INSERT OR IGNORE INTO users (loginid, username, deptname, is_admin) VALUES ('syngha.han', 'Han Syngha', 'S/W혁신팀(S.LSI)', 1);
