// Bridges /api/create-order and /api/orders: create-order computes the
// authoritative items/prices/shipping/discount/total server-side and
// stashes it here keyed by the Razorpay order id; /api/orders looks it
// up after verifying payment, instead of trusting client-supplied prices
// for what actually gets recorded and charged.
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
    schemaReady = sql`CREATE TABLE IF NOT EXISTS pending_orders (
      razorpay_order_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
  }
  await schemaReady;
}

const pgStore = {
  async save(razorpayOrderId, data) {
    await ensureSchema();
    await sql`INSERT INTO pending_orders (razorpay_order_id, data) VALUES (${razorpayOrderId}, ${JSON.stringify(data)})
      ON CONFLICT (razorpay_order_id) DO UPDATE SET data = ${JSON.stringify(data)}`;
  },
  async get(razorpayOrderId) {
    await ensureSchema();
    const rows = await sql`SELECT data FROM pending_orders WHERE razorpay_order_id = ${razorpayOrderId} LIMIT 1`;
    return rows.length ? rows[0].data : null;
  },
  async remove(razorpayOrderId) {
    await ensureSchema();
    await sql`DELETE FROM pending_orders WHERE razorpay_order_id = ${razorpayOrderId}`;
  },
};

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_pending_orders.json');

function readFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function writeFileData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const fileStore = {
  async save(razorpayOrderId, data) {
    const all = readFile();
    all[razorpayOrderId] = data;
    writeFileData(all);
  },
  async get(razorpayOrderId) {
    const all = readFile();
    return all[razorpayOrderId] || null;
  },
  async remove(razorpayOrderId) {
    const all = readFile();
    delete all[razorpayOrderId];
    writeFileData(all);
  },
};

const store = sql ? pgStore : fileStore;
export default store;
