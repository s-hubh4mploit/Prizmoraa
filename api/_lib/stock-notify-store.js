// Back-in-stock subscriptions: "notify me when this is available again".
// Same dual Postgres/file-store pattern as the rest of the API.
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
    schemaReady = sql`CREATE TABLE IF NOT EXISTS stock_notifications (
      product_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (product_id, user_id)
    )`;
  }
  await schemaReady;
}

const pgStore = {
  async subscribe(productId, userId, email) {
    await ensureSchema();
    await sql`INSERT INTO stock_notifications (product_id, user_id, email)
      VALUES (${productId}, ${userId}, ${email})
      ON CONFLICT (product_id, user_id) DO NOTHING`;
  },
  async isSubscribed(productId, userId) {
    await ensureSchema();
    const rows = await sql`SELECT 1 FROM stock_notifications WHERE product_id = ${productId} AND user_id = ${userId} LIMIT 1`;
    return rows.length > 0;
  },
  async listForProduct(productId) {
    await ensureSchema();
    return sql`SELECT * FROM stock_notifications WHERE product_id = ${productId}`;
  },
  async clearForProduct(productId) {
    await ensureSchema();
    await sql`DELETE FROM stock_notifications WHERE product_id = ${productId}`;
  },
};

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_stock_notifications.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_stock_notifications.lock');

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
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeFileData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return withLock(() => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'));
}

const fileStore = {
  async subscribe(productId, userId, email) {
    const all = readFile();
    if (all.some(r => r.product_id === productId && r.user_id === userId)) return;
    all.push({ product_id: productId, user_id: userId, email, created_at: new Date().toISOString() });
    writeFileData(all);
  },
  async isSubscribed(productId, userId) {
    const all = readFile();
    return all.some(r => r.product_id === productId && r.user_id === userId);
  },
  async listForProduct(productId) {
    return readFile().filter(r => r.product_id === productId);
  },
  async clearForProduct(productId) {
    writeFileData(readFile().filter(r => r.product_id !== productId));
  },
};

const store = sql ? pgStore : fileStore;
export default store;
