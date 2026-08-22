// Server-side brute-force protection shared by any endpoint that needs it
// (admin login, etc). Backed by Postgres when available so limits survive
// across serverless invocations/instances; falls back to an in-memory Map
// for local dev (still useful within one warm process).
import { neon } from '@neondatabase/serverless';

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  }
  await schemaReady;
}

const memoryStore = new Map();

async function isLocked(key) {
  const now = Date.now();
  if (sql) {
    await ensureSchema();
    const rows = await sql`SELECT locked_until FROM rate_limits WHERE bucket_key = ${key} LIMIT 1`;
    if (!rows.length || !rows[0].locked_until) return { locked: false };
    const lockedUntil = new Date(rows[0].locked_until).getTime();
    return lockedUntil > now ? { locked: true, retryAfterMs: lockedUntil - now } : { locked: false };
  }
  const entry = memoryStore.get(key);
  if (entry && entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now };
  }
  return { locked: false };
}

async function recordFailure(key, { maxAttempts = 5, lockMs = 5 * 60 * 1000, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  if (sql) {
    await ensureSchema();
    const rows = await sql`SELECT attempts, updated_at FROM rate_limits WHERE bucket_key = ${key} LIMIT 1`;
    let attempts = 0;
    if (rows.length) {
      const updatedAt = new Date(rows[0].updated_at).getTime();
      attempts = (now - updatedAt) > windowMs ? 0 : rows[0].attempts;
    }
    attempts += 1;
    const lockedUntil = attempts >= maxAttempts ? new Date(now + lockMs) : null;
    const storedAttempts = lockedUntil ? 0 : attempts;
    await sql`INSERT INTO rate_limits (bucket_key, attempts, locked_until, updated_at)
      VALUES (${key}, ${storedAttempts}, ${lockedUntil}, now())
      ON CONFLICT (bucket_key) DO UPDATE SET attempts = ${storedAttempts}, locked_until = ${lockedUntil}, updated_at = now()`;
    return;
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
  if (sql) {
    await ensureSchema();
    await sql`DELETE FROM rate_limits WHERE bucket_key = ${key}`;
  } else {
    memoryStore.delete(key);
  }
}

export default { isLocked, recordFailure, clearAttempts };
