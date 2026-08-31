// Server-side brute-force protection shared by any endpoint that needs it
// (admin login, etc). Backed by Turso (libSQL) when available so limits
// survive across serverless invocations/instances; falls back to an
// in-memory Map for local dev (still useful within one warm process).
import { sql, hasDb } from './db.js';

let schemaReady = null;
async function ensureSchema() {
  if (!hasDb) return;
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT NOT NULL
    )`;
  }
  await schemaReady;
}

const memoryStore = new Map();

async function isLocked(key) {
  const now = Date.now();
  if (hasDb) {
    try {
      await ensureSchema();
      const rows = await sql`SELECT locked_until FROM rate_limits WHERE bucket_key = ${key} LIMIT 1`;
      if (!rows.length || !rows[0].locked_until) return { locked: false };
      const lockedUntil = new Date(rows[0].locked_until).getTime();
      return lockedUntil > now ? { locked: true, retryAfterMs: lockedUntil - now } : { locked: false };
    } catch (err) {
      console.warn('Rate limit DB unavailable, falling back to memory store:', err.message);
    }
  }
  const entry = memoryStore.get(key);
  if (entry && entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now };
  }
  return { locked: false };
}

async function recordFailure(key, { maxAttempts = 5, lockMs = 5 * 60 * 1000, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (hasDb) {
    try {
      await ensureSchema();
      const rows = await sql`SELECT attempts, updated_at FROM rate_limits WHERE bucket_key = ${key} LIMIT 1`;
      let attempts = 0;
      if (rows.length) {
        const updatedAt = new Date(rows[0].updated_at).getTime();
        attempts = (now - updatedAt) > windowMs ? 0 : rows[0].attempts;
      }
      attempts += 1;
      const lockedUntil = attempts >= maxAttempts ? new Date(now + lockMs).toISOString() : null;
      const storedAttempts = lockedUntil ? 0 : attempts;
      const nowIso = new Date(now).toISOString();
      await sql`INSERT INTO rate_limits (bucket_key, attempts, locked_until, updated_at)
        VALUES (${key}, ${storedAttempts}, ${lockedUntil}, ${nowIso})
        ON CONFLICT(bucket_key) DO UPDATE SET attempts = ${storedAttempts}, locked_until = ${lockedUntil}, updated_at = ${nowIso}`;
      return;
    } catch (err) {
      console.warn('Rate limit DB unavailable, falling back to memory store:', err.message);
    }
  }
  const entry = memoryStore.get(key) || { attempts: 0, lockedUntil: null, updatedAt: now };
  if (now - entry.updatedAt > windowMs) entry.attempts = 0;
  entry.attempts += 1;
  entry.updatedAt = now;
  entry.lockedUntil = entry.attempts >= maxAttempts ? now + lockMs : null;
  if (entry.lockedUntil) entry.attempts = 0;
  memoryStore.set(key, entry);
}

async function clearAttempts(key) {
  if (hasDb) {
    try {
      await ensureSchema();
      await sql`DELETE FROM rate_limits WHERE bucket_key = ${key}`;
      return;
    } catch (err) {
      console.warn('Rate limit DB unavailable, clearing memory store only:', err.message);
    }
  }
  memoryStore.delete(key);
}

export default { isLocked, recordFailure, clearAttempts };
