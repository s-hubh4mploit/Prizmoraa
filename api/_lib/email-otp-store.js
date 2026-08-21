// Small dedicated store for email-OTP login codes — separate from the
// users table since a code can be requested for an email that doesn't
// have an account yet (email OTP can sign someone up, not just log in).
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS email_otps (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )`;
  }
  await schemaReady;
}

const pgStore = {
  async save(email, code, expiresAt) {
    await ensureSchema();
    await sql`INSERT INTO email_otps (email, code, expires_at) VALUES (${email}, ${code}, ${expiresAt.toISOString()})
      ON CONFLICT (email) DO UPDATE SET code = ${code}, expires_at = ${expiresAt.toISOString()}`;
  },
  async get(email) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM email_otps WHERE email = ${email} LIMIT 1`;
    return rows[0] || null;
  },
  async remove(email) {
    await ensureSchema();
    await sql`DELETE FROM email_otps WHERE email = ${email}`;
  },
};

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_email_otps.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_email_otps.lock');

function withLock(callback) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > 3000) throw new Error('Could not acquire lock');
  }
  fs.writeFileSync(LOCK_FILE, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try { return callback(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch (e) {} }
}

function readFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}', 'utf8');
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function writeFileData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return withLock(() => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'));
}

const fileStore = {
  async save(email, code, expiresAt) {
    const all = readFile();
    all[email] = { email, code, expires_at: expiresAt.toISOString() };
    writeFileData(all);
  },
  async get(email) {
    const all = readFile();
    return all[email] || null;
  },
  async remove(email) {
    const all = readFile();
    delete all[email];
    writeFileData(all);
  },
};

const store = sql ? pgStore : fileStore;
export default store;
