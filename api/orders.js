import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { getUserIdFromRequest } from './auth.js';
import { sendOrderConfirmationEmail } from './_lib/send-order-email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function isAdmin(req) {
  if (!ADMIN_API_KEY) return false;
  return req.headers['x-admin-key'] === ADMIN_API_KEY;
}

/* ============================================================
 * Postgres-backed store
 * ============================================================ */
let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      pincode TEXT NOT NULL,
      items JSONB NOT NULL,
      total NUMERIC NOT NULL,
      payment_id TEXT,
      status TEXT DEFAULT 'paid',
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
  }
  await schemaReady;
}

function rowToOrder(r) {
  return {
    id: r.id, userId: r.user_id, name: r.name, email: r.email, phone: r.phone,
    address: r.address, pincode: r.pincode, items: r.items, total: Number(r.total),
    paymentId: r.payment_id, status: r.status, createdAt: r.created_at,
  };
}

const pgStore = {
  async create(order) {
    await ensureSchema();
    await sql`INSERT INTO orders (id, user_id, name, email, phone, address, pincode, items, total, payment_id, status)
      VALUES (${order.id}, ${order.userId}, ${order.name}, ${order.email}, ${order.phone}, ${order.address}, ${order.pincode},
              ${JSON.stringify(order.items)}, ${order.total}, ${order.paymentId}, ${order.status})`;
    return order;
  },
  async listAll() {
    await ensureSchema();
    const rows = await sql`SELECT * FROM orders ORDER BY created_at DESC`;
    return rows.map(rowToOrder);
  },
  async listForUser(userId) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM orders WHERE user_id = ${userId} ORDER BY created_at DESC`;
    return rows.map(rowToOrder);
  },
};

/* ============================================================
 * JSON-file fallback store (local dev / no database attached)
 * ============================================================ */
const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_orders.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_orders.lock');

function withLock(callback) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > 3000) throw new Error('Could not acquire lock');
  }
  fs.writeFileSync(LOCK_FILE, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try { return callback(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch (e) {} }
}

function readOrdersFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeOrdersFile(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return withLock(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  });
}

const fileStore = {
  async create(order) {
    const orders = readOrdersFile();
    orders.unshift({ ...order, createdAt: new Date().toISOString() });
    writeOrdersFile(orders);
    return order;
  },
  async listAll() {
    return readOrdersFile();
  },
  async listForUser(userId) {
    return readOrdersFile().filter(o => o.userId === userId);
  },
};

const store = sql ? pgStore : fileStore;

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async (req, res) => {
  const { method, url } = req;
  const host = req.headers.host || 'localhost';
  const pathname = new URL(url, `http://${host}`).pathname;
  setJsonHeaders(res);

  try {
    if (pathname === '/api/orders' && method === 'POST') {
      const body = await readBody(req);
      const { items, total, name, phone, address, pincode, paymentId, email } = body;
      if (!Array.isArray(items) || items.length === 0 || !total || !name || !phone || !address || !pincode) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing required order fields.' }));
      }
      const userId = getUserIdFromRequest(req);
      const order = {
        id: 'order-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        userId: userId || null,
        name, email: email || null, phone, address, pincode,
        items, total, paymentId: paymentId || null, status: 'paid',
      };
      await store.create(order);
      const emailResult = await sendOrderConfirmationEmail(order);
      return res.end(JSON.stringify({ order, emailSent: emailResult.sent }));
    }

    if (pathname === '/api/orders' && method === 'GET') {
      if (!isAdmin(req)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Admin access required.' }));
      }
      const orders = await store.listAll();
      return res.end(JSON.stringify(orders));
    }

    if (pathname === '/api/orders/mine' && method === 'GET') {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Please sign in to view your orders.' }));
      }
      const orders = await store.listForUser(userId);
      return res.end(JSON.stringify(orders));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Server error', message: err.message }));
  }
};
