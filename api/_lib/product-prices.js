// Read-only product price/name/stock lookup, used by create-order.js to
// compute the amount to charge from the database's own prices — never
// trusting a price the client sends, since that's how someone could pay
// ₹1 for a cart full of jewellery.
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(__dirname, '..', '..', 'generated_products_encoded.json');

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

function readDefaultInventory() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_DATA_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_products.json');

function readInventoryFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : readDefaultInventory();
  } catch (err) {
    return readDefaultInventory();
  }
}

// Returns a Map<id, {id, name, price, stock, image}> for the given ids —
// any id not found in the store is simply absent from the result.
export async function getProductsByIds(ids) {
  const uniqueIds = [...new Set(ids)];
  const map = new Map();
  if (uniqueIds.length === 0) return map;

  if (sql) {
    await sql`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data JSONB NOT NULL)`;
    const rows = await sql`SELECT data FROM products WHERE id = ANY(${uniqueIds})`;
    for (const row of rows) map.set(row.data.id, row.data);
    return map;
  }

  const inventory = readInventoryFile();
  for (const id of uniqueIds) {
    const product = inventory.find(p => p.id === id);
    if (product) map.set(id, product);
  }
  return map;
}
