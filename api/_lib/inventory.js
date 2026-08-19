// Reduces product stock after a paid order — shared by api/orders.js so
// stock updates use the same Postgres/file dual-store pattern as products.js
// without the two API files needing to import each other's route handlers.
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

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_products.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_products.lock');

function withLock(callback) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > 3000) throw new Error('Could not acquire lock');
  }
  fs.writeFileSync(LOCK_FILE, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try { return callback(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch (e) {} }
}

// Best-effort: the payment has already succeeded by the time this runs, so a
// failure here must never throw and block order recording — it only logs.
export async function decrementStock(items) {
  if (!Array.isArray(items) || items.length === 0) return;

  if (sql) {
    await sql`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data JSONB NOT NULL)`;
    for (const { id, qty } of items) {
      if (!id || !qty) continue;
      try {
        const rows = await sql`SELECT data FROM products WHERE id = ${id} LIMIT 1`;
        if (!rows.length) continue;
        const product = rows[0].data;
        const currentStock = Number.isFinite(product.stock) ? product.stock : 0;
        product.stock = Math.max(0, currentStock - qty);
        await sql`UPDATE products SET data = ${JSON.stringify(product)} WHERE id = ${id}`;
      } catch (err) {
        console.error('Failed to decrement stock for', id, err);
      }
    }
    return;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) return;
    withLock(() => {
      const inventory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(inventory)) return;
      for (const { id, qty } of items) {
        if (!id || !qty) continue;
        const product = inventory.find(p => p.id === id);
        if (!product) continue;
        const currentStock = Number.isFinite(product.stock) ? product.stock : 0;
        product.stock = Math.max(0, currentStock - qty);
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(inventory, null, 2), 'utf8');
    });
  } catch (err) {
    console.error('Failed to decrement stock (file store)', err);
  }
}
