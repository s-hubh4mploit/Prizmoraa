import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'generated_products_encoded.json');

// Vercel's Postgres (Neon) integration injects one of these automatically once a
// database is attached to the project in the Vercel dashboard (Storage tab -> Create
// Database -> Postgres). When present, product data is stored there so edits made in
// the admin dashboard persist for every visitor. Without it, we fall back to a local
// JSON file — fine for local development, but NOT durable on Vercel's serverless
// filesystem, since each invocation can run in a fresh, ephemeral container.
const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

function readJsonFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function readDefaultInventory() {
  const defaults = readJsonFile(DEFAULT_DATA_FILE);
  return Array.isArray(defaults) ? defaults : [];
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/* ============================================================
 * Postgres-backed store (used when a connection string is set)
 * ============================================================ */
let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )`;
  }
  await schemaReady;
}

async function seedIfEmpty() {
  await ensureSchema();
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM products`;
  if (count > 0) return;
  const defaults = readDefaultInventory();
  for (const item of defaults) {
    await sql`INSERT INTO products (id, data) VALUES (${item.id}, ${JSON.stringify(item)})
      ON CONFLICT (id) DO NOTHING`;
  }
}

const pgStore = {
  async getInventory() {
    await seedIfEmpty();
    const rows = await sql`SELECT data FROM products ORDER BY id`;
    return rows.map(r => r.data);
  },
  async findProductById(id) {
    await ensureSchema();
    const rows = await sql`SELECT data FROM products WHERE id = ${id} LIMIT 1`;
    return rows.length ? rows[0].data : null;
  },
  async saveProduct(item) {
    await ensureSchema();
    await sql`INSERT INTO products (id, data) VALUES (${item.id}, ${JSON.stringify(item)})
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(item)}`;
    return item;
  },
  async deleteProduct(id) {
    await ensureSchema();
    await sql`DELETE FROM products WHERE id = ${id}`;
  },
  async resetToDefaults() {
    await ensureSchema();
    await sql`TRUNCATE TABLE products`;
    const defaults = readDefaultInventory();
    for (const item of defaults) {
      await sql`INSERT INTO products (id, data) VALUES (${item.id}, ${JSON.stringify(item)})`;
    }
    return defaults;
  },
};

/* ============================================================
 * JSON-file-backed store (fallback for local dev / no database)
 * ============================================================ */
const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_products.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_products.lock');

function withLock(callback) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > 3000) {
      throw new Error('Could not acquire lock');
    }
  }
  fs.writeFileSync(LOCK_FILE, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try {
    return callback();
  } finally {
    try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) return;
  const defaults = readDefaultInventory();
  fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2), 'utf8');
}

function readInventoryFile() {
  ensureDataFile();
  const inventory = readJsonFile(DATA_FILE);
  if (Array.isArray(inventory)) return inventory;
  return readDefaultInventory();
}

function writeInventoryFile(data) {
  ensureDataFile();
  return withLock(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return data;
  });
}

const fileStore = {
  async getInventory() {
    return readInventoryFile();
  },
  async findProductById(id) {
    const products = readInventoryFile();
    return products.find(item => item.id === id) || null;
  },
  async saveProduct(item) {
    const inventory = readInventoryFile();
    const existingIndex = inventory.findIndex(p => p.id === item.id);
    if (existingIndex > -1) inventory[existingIndex] = item;
    else inventory.push(item);
    writeInventoryFile(inventory);
    return item;
  },
  async deleteProduct(id) {
    const inventory = readInventoryFile().filter(item => item.id !== id);
    writeInventoryFile(inventory);
  },
  async resetToDefaults() {
    const defaults = readDefaultInventory();
    writeInventoryFile(defaults);
    return defaults;
  },
};

const store = sql ? pgStore : fileStore;

function matchRoute(regex, pathname) {
  const match = pathname.match(regex);
  if (!match) return null;
  return match[1];
}

export default async (req, res) => {
  const { method, url } = req;
  const host = req.headers.host || 'localhost';
  const pathname = new URL(url, `http://${host}`).pathname;

  try {
    if (pathname === '/api/products' && method === 'GET') {
      const inventory = await store.getInventory();
      setJsonHeaders(res);
      return res.end(JSON.stringify(inventory));
    }

    if (pathname === '/api/products' && method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const item = JSON.parse(body);
          if (!item || !item.id) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid product payload' }));
          }
          const saved = await store.saveProduct(item);
          setJsonHeaders(res);
          return res.end(JSON.stringify(saved));
        } catch (err) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: 'Failed to save product' }));
        }
      });
      return;
    }

    if (pathname === '/api/products/reset' && method === 'POST') {
      await store.resetToDefaults();
      setJsonHeaders(res);
      return res.end(JSON.stringify({ success: true }));
    }

    if (pathname.startsWith('/api/products/') && method === 'GET') {
      const id = decodeURIComponent(matchRoute(/^\/api\/products\/(.+)$/, pathname));
      if (!id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing product id' }));
      }
      const product = await store.findProductById(id);
      if (!product) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'Not found' }));
      }
      setJsonHeaders(res);
      return res.end(JSON.stringify(product));
    }

    if (pathname.startsWith('/api/products/') && method === 'DELETE') {
      const id = decodeURIComponent(matchRoute(/^\/api\/products\/(.+)$/, pathname));
      if (!id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing product id' }));
      }
      await store.deleteProduct(id);
      setJsonHeaders(res);
      return res.end(JSON.stringify({ success: true }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    res.statusCode = 500;
    setJsonHeaders(res);
    res.end(JSON.stringify({ error: 'Server error', message: err.message }));
  }
};
