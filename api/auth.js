import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '30d';

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone || '' };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ============================================================
 * Postgres-backed store
 * ============================================================ */
let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
  }
  await schemaReady;
}

const pgStore = {
  async findByEmail(email) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
    return rows[0] || null;
  },
  async findById(id) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return rows[0] || null;
  },
  async create({ id, name, email, phone, passwordHash }) {
    await ensureSchema();
    await sql`INSERT INTO users (id, name, email, phone, password_hash)
      VALUES (${id}, ${name}, ${email.toLowerCase()}, ${phone || ''}, ${passwordHash})`;
  },
};

/* ============================================================
 * JSON-file fallback store (local dev / no database attached)
 * ============================================================ */
const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_users.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_users.lock');

function withLock(callback) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > 3000) throw new Error('Could not acquire lock');
  }
  fs.writeFileSync(LOCK_FILE, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try { return callback(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch (e) {} }
}

function readUsersFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeUsersFile(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return withLock(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  });
}

const fileStore = {
  async findByEmail(email) {
    const users = readUsersFile();
    return users.find(u => u.email === email.toLowerCase()) || null;
  },
  async findById(id) {
    const users = readUsersFile();
    return users.find(u => u.id === id) || null;
  },
  async create({ id, name, email, phone, passwordHash }) {
    const users = readUsersFile();
    users.push({ id, name, email: email.toLowerCase(), phone: phone || '', password_hash: passwordHash, created_at: new Date().toISOString() });
    writeUsersFile(users);
  },
};

const store = sql ? pgStore : fileStore;

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function getUserIdFromRequest(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    return payload.sub;
  } catch (e) {
    return null;
  }
}

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

  if (!JWT_SECRET) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Server is not configured (missing JWT_SECRET)' }));
  }

  try {
    if (pathname === '/api/auth/signup' && method === 'POST') {
      const { name, email, phone, password } = await readBody(req);
      if (!name || !isValidEmail(email) || !password || password.length < 6) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Please provide a name, valid email, and a password of at least 6 characters.' }));
      }
      const existing = await store.findByEmail(email);
      if (existing) {
        res.statusCode = 409;
        return res.end(JSON.stringify({ error: 'An account with this email already exists.' }));
      }
      const id = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const passwordHash = await bcrypt.hash(password, 10);
      await store.create({ id, name, email, phone, passwordHash });
      const user = { id, name, email: email.toLowerCase(), phone: phone || '' };
      return res.end(JSON.stringify({ token: signToken(user), user }));
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = await readBody(req);
      if (!isValidEmail(email) || !password) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Please provide your email and password.' }));
      }
      const row = await store.findByEmail(email);
      if (!row) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Invalid email or password.' }));
      }
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Invalid email or password.' }));
      }
      return res.end(JSON.stringify({ token: signToken(row), user: publicUser(row) }));
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Not signed in.' }));
      }
      const row = await store.findById(userId);
      if (!row) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Session no longer valid.' }));
      }
      return res.end(JSON.stringify({ user: publicUser(row) }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Server error', message: err.message }));
  }
};
