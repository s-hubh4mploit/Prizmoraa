// Site-wide settings (shipping charge, discount) — a single row/record,
// same dual Postgres/file-store pattern as the rest of the API.
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

const DEFAULTS = { shippingCharge: 0, discountPercent: 0 };

let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      shipping_charge NUMERIC NOT NULL DEFAULT 0,
      discount_percent NUMERIC NOT NULL DEFAULT 0
    )`;
  }
  await schemaReady;
}

const pgStore = {
  async get() {
    await ensureSchema();
    const rows = await sql`SELECT * FROM site_settings WHERE id = 1 LIMIT 1`;
    if (!rows.length) return { ...DEFAULTS };
    return { shippingCharge: Number(rows[0].shipping_charge), discountPercent: Number(rows[0].discount_percent) };
  },
  async set({ shippingCharge, discountPercent }) {
    await ensureSchema();
    await sql`INSERT INTO site_settings (id, shipping_charge, discount_percent)
      VALUES (1, ${shippingCharge}, ${discountPercent})
      ON CONFLICT (id) DO UPDATE SET shipping_charge = ${shippingCharge}, discount_percent = ${discountPercent}`;
    return { shippingCharge, discountPercent };
  },
};

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_settings.json');

function readFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { shippingCharge: Number(parsed.shippingCharge) || 0, discountPercent: Number(parsed.discountPercent) || 0 };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

const fileStore = {
  async get() {
    return readFile();
  },
  async set({ shippingCharge, discountPercent }) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const value = { shippingCharge, discountPercent };
    fs.writeFileSync(DATA_FILE, JSON.stringify(value, null, 2), 'utf8');
    return value;
  },
};

const store = sql ? pgStore : fileStore;
export default store;
