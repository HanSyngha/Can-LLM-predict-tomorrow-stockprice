/**
 * Auth Routes - SSO login, user info, access logging.
 *
 * POST /api/auth/login   - SSO callback (loginid, username, deptname) → JWT
 * GET  /api/auth/me       - Current user info (requires JWT)
 * GET  /api/auth/logs     - Access logs (admin only)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, createHmac } from 'crypto';
import { getDb } from '../db/database.js';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'stock-self-evolving-secret-key';
const ADMIN_USERS = ['syngha.han'];

// === Simple JWT (HS256) ===

interface JWTPayload {
  loginid: string;
  username: string;
  deptname: string;
  isAdmin: boolean;
  iat: number;
  exp: number;
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + 86400 * 7 }; // 7 days
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(full));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// === SSO Token Decode (nexus-coder compatible) ===

function decodeSSOToken(base64Token: string): { loginid: string; username: string; deptname: string } | null {
  try {
    const binaryString = Buffer.from(base64Token, 'base64').toString('binary');
    const jsonString = decodeURIComponent(
      binaryString.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    const payload = JSON.parse(jsonString);
    return {
      loginid: safeDecodeURIComponent(payload.loginid || ''),
      username: safeDecodeURIComponent(payload.username || ''),
      deptname: safeDecodeURIComponent(payload.deptname || ''),
    };
  } catch {
    return null;
  }
}

function safeDecodeURIComponent(text: string): string {
  if (!text) return text;
  try {
    if (text.includes('%')) return decodeURIComponent(text);
    const buf = Buffer.from(text, 'latin1');
    const decoded = buf.toString('utf8');
    if (decoded !== text && !decoded.includes('\ufffd')) return decoded;
    return text;
  } catch {
    return text;
  }
}

// === Access Logging ===

function logAccess(loginid: string, path: string, method: string, ip: string | null, ua: string | null) {
  try {
    getDb().prepare(
      'INSERT INTO access_logs (loginid, path, method, ip, user_agent) VALUES (?, ?, ?, ?, ?)'
    ).run(loginid, path, method, ip || '', ua || '');
  } catch {
    // ignore logging errors
  }
}

// === Routes ===

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/auth/login - SSO login
  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body as { token?: string; loginid?: string; username?: string; deptname?: string };

    let loginid: string;
    let username: string;
    let deptname: string;

    if (body.token) {
      // SSO token format: "sso.<base64json>"
      const raw = body.token.startsWith('sso.') ? body.token.substring(4) : body.token;
      const decoded = decodeSSOToken(raw);
      if (!decoded || !decoded.loginid) {
        return reply.status(400).send({ error: 'Invalid SSO token' });
      }
      loginid = decoded.loginid;
      username = decoded.username;
      deptname = decoded.deptname;
    } else if (body.loginid) {
      // Direct login (SSO callback data)
      loginid = body.loginid;
      username = body.username || loginid;
      deptname = body.deptname || '';
    } else {
      return reply.status(400).send({ error: 'Missing login data' });
    }

    const isAdmin = ADMIN_USERS.includes(loginid);

    // Upsert user
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE loginid = ?').get(loginid);
    if (existing) {
      db.prepare(
        'UPDATE users SET username = ?, deptname = ?, is_admin = ?, last_login_at = datetime(\'now\') WHERE loginid = ?'
      ).run(username, deptname, isAdmin ? 1 : 0, loginid);
    } else {
      db.prepare(
        'INSERT INTO users (loginid, username, deptname, is_admin, last_login_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
      ).run(loginid, username, deptname, isAdmin ? 1 : 0);
    }

    logAccess(loginid, '/api/auth/login', 'POST', request.ip, request.headers['user-agent'] as string);
    logger.info(`User logged in: ${loginid} (admin: ${isAdmin})`);

    const jwt = signJWT({ loginid, username, deptname, isAdmin });
    return { success: true, token: jwt, user: { loginid, username, deptname, isAdmin } };
  });

  // GET /api/auth/me - Current user info
  app.get('/api/auth/me', async (request, reply) => {
    const user = extractUser(request);
    if (!user) return reply.status(401).send({ error: 'Not authenticated' });
    return { loginid: user.loginid, username: user.username, deptname: user.deptname, isAdmin: user.isAdmin };
  });

  // POST /api/auth/log - Log page access
  app.post('/api/auth/log', async (request) => {
    const user = extractUser(request);
    if (!user) return { ok: true };
    const body = request.body as { path: string };
    logAccess(user.loginid, body.path || '/', 'VIEW', request.ip, request.headers['user-agent'] as string);
    return { ok: true };
  });

  // GET /api/auth/logs - Access logs (admin only)
  app.get('/api/auth/logs', async (request, reply) => {
    const user = extractUser(request);
    if (!user?.isAdmin) return reply.status(403).send({ error: 'Admin access required' });
    const limit = (request.query as { limit?: string }).limit || '100';
    const logs = getDb().prepare(
      'SELECT * FROM access_logs ORDER BY created_at DESC LIMIT ?'
    ).all(parseInt(limit, 10));
    return logs;
  });

  // GET /api/auth/users - User list (admin only)
  app.get('/api/auth/users', async (request, reply) => {
    const user = extractUser(request);
    if (!user?.isAdmin) return reply.status(403).send({ error: 'Admin access required' });
    const users = getDb().prepare('SELECT * FROM users ORDER BY last_login_at DESC').all();
    return users;
  });
}

function extractUser(request: FastifyRequest): JWTPayload | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyJWT(auth.substring(7));
}

export { extractUser, ADMIN_USERS };
