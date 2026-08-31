// Back-in-stock subscriptions: "notify me when this is available again".
// Same dual Postgres/file-store pattern as the rest of the API.
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql, hasDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = Promise.all([
      sql`CREATE TABLE IF NOT EXISTS stock_notifications (
        product_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (product_id, user_id)
      )`,
      sql`CREATE TABLE IF NOT EXISTS stock_notification_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        product_name TEXT,
        notified_at TEXT NOT NULL
      )`,
    ]);
  }
  await schemaReady;
}

const pgStore = {
  async subscribe(productId, userId, email) {
    await ensureSchema();
    await sql`INSERT INTO stock_notifications (product_id, user_id, email, created_at)
      VALUES (${productId}, ${userId}, ${email}, ${new Date().toISOString()})
      ON CONFLICT(product_id, user_id) DO NOTHING`;
  },
  async isSubscribed(productId, userId) {
    await ensureSchema();
    const rows = await sql`SELECT 1 FROM stock_notifications WHERE product_id = ${productId} AND user_id = ${userId} LIMIT 1`;
    return rows.length > 0;
  },
  async listAll() {
    await ensureSchema();
    return sql`SELECT * FROM stock_notifications ORDER BY created_at DESC`;
  },
  async listForProduct(productId) {
    await ensureSchema();
    return sql`SELECT * FROM stock_notifications WHERE product_id = ${productId}`;
  },
  async clearForProduct(productId) {
    await ensureSchema();
    await sql`DELETE FROM stock_notifications WHERE product_id = ${productId}`;
  },
  async remove(productId, userId) {
    await ensureSchema();
    await sql`DELETE FROM stock_notifications WHERE product_id = ${productId} AND user_id = ${userId}`;
  },
  async logNotified(productId, userId, email, productName) {
    await ensureSchema();
    await sql`INSERT INTO stock_notification_history (product_id, user_id, email, product_name, notified_at)
      VALUES (${productId}, ${userId}, ${email}, ${productName}, ${new Date().toISOString()})`;
  },
  async listHistory() {
    await ensureSchema();
    return sql`SELECT * FROM stock_notification_history ORDER BY notified_at DESC`;
  },
};

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_stock_notifications.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_stock_notifications.lock');
const HISTORY_FILE = path.join(DATA_DIR, 'prizmoraa_stock_notification_history.json');
const HISTORY_LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_stock_notification_history.lock');

function withLock(lockFile, callback) {
  const start = Date.now();
  while (fs.existsSync(lockFile)) {
    if (Date.now() - start > 3000) throw new Error('Could not acquire lock');
  }
  fs.writeFileSync(lockFile, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try { return callback(); } finally { try { fs.unlinkSync(lockFile); } catch (e) {} }
}

function readJsonArray(file) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeJsonArray(file, lockFile, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return withLock(lockFile, () => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'));
}

function readFile() {
  return readJsonArray(DATA_FILE);
}

function writeFileData(data) {
  return writeJsonArray(DATA_FILE, LOCK_FILE, data);
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
  async listAll() {
    return readFile().slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  },
  async listForProduct(productId) {
    return readFile().filter(r => r.product_id === productId);
  },
  async clearForProduct(productId) {
    writeFileData(readFile().filter(r => r.product_id !== productId));
  },
  async remove(productId, userId) {
    writeFileData(readFile().filter(r => !(r.product_id === productId && r.user_id === userId)));
  },
  async logNotified(productId, userId, email, productName) {
    const all = readJsonArray(HISTORY_FILE);
    all.push({ product_id: productId, user_id: userId, email, product_name: productName, notified_at: new Date().toISOString() });
    writeJsonArray(HISTORY_FILE, HISTORY_LOCK_FILE, all);
  },
  async listHistory() {
    return readJsonArray(HISTORY_FILE).slice().sort((a, b) => new Date(b.notified_at || 0) - new Date(a.notified_at || 0));
  },
};

const store = hasDb ? pgStore : fileStore;
export default store;
