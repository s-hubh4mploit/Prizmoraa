import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'generated_products_encoded.json');
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

function readJsonFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) return;
  const defaults = readJsonFile(DEFAULT_DATA_FILE);
  if (Array.isArray(defaults)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaults, null, 2), 'utf8');
  } else {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function readInventory() {
  ensureDataFile();
  const inventory = readJsonFile(DATA_FILE);
  if (Array.isArray(inventory)) {
    return inventory;
  }
  const defaults = readJsonFile(DEFAULT_DATA_FILE);
  return Array.isArray(defaults) ? defaults : [];
}

function readDefaultInventory() {
  const defaults = readJsonFile(DEFAULT_DATA_FILE);
  return Array.isArray(defaults) ? defaults : [];
}

function writeInventory(data) {
  ensureDataFile();
  return withLock(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return data;
  });
}

function getInventory() {
  const products = readInventory();
  if (!Array.isArray(products) || products.length === 0) {
    return [];
  }
  return products;
}

function findProductById(id) {
  const products = getInventory();
  return products.find((item) => item.id === id) || null;
}

function matchRoute(regex, pathname) {
  const match = pathname.match(regex);
  if (!match) return null;
  return match[1];
}

export default async (req, res) => {
  const { method, url } = req;
  const host = req.headers.host || 'localhost';
  const pathname = new URL(url, `http://${host}`).pathname;

  if (pathname === '/api/products' && method === 'GET') {
    setJsonHeaders(res);
    return res.end(JSON.stringify(getInventory()));
  }

  if (pathname === '/api/products' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        if (!item || !item.id) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Invalid product payload' }));
        }

        const inventory = getInventory();
        const existingIndex = inventory.findIndex(p => p.id === item.id);
        if (existingIndex > -1) {
          inventory[existingIndex] = item;
        } else {
          inventory.push(item);
        }
        writeInventory(inventory);
        setJsonHeaders(res);
        return res.end(JSON.stringify(item));
      } catch (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: 'Failed to save product' }));
      }
    });
    return;
  }

  if (pathname === '/api/products/reset' && method === 'POST') {
    const defaults = readDefaultInventory();
    writeInventory(defaults);
    setJsonHeaders(res);
    return res.end(JSON.stringify({ success: true }));
  }

  if (pathname.startsWith('/api/products/') && method === 'GET') {
    const id = decodeURIComponent(matchRoute(/^\/api\/products\/(.+)$/, pathname));
    if (!id) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Missing product id' }));
    }
    const product = findProductById(id);
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
    const inventory = getInventory();
    const updated = inventory.filter(item => item.id !== id);
    writeInventory(updated);
    setJsonHeaders(res);
    return res.end(JSON.stringify({ success: true }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};
