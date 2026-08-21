import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { verifyFirebaseIdToken } from './_lib/verify-firebase-token.js';
import { sendPasswordResetEmail } from './_lib/send-password-reset-email.js';
import { sendEmailOtp } from './_lib/send-email-otp.js';
import emailOtpStore from './_lib/email-otp-store.js';
import { getLatestAddressesByUserId } from './_lib/latest-order-address.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '30d';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY_V2 || process.env.ADMIN_API_KEY;

function isAdmin(req) {
  if (!ADMIN_API_KEY) return false;
  return req.headers['x-admin-key'] === ADMIN_API_KEY;
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone || '', picture: row.picture || '' };
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
    schemaReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`;
      // Relaxed for Google/phone sign-in, where there's no password and
      // sometimes no email (phone-only accounts) — safe to re-run every
      // cold start since dropping an already-nullable constraint is a no-op.
      await sql`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`;
      await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS signin_provider TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`;
    })();
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
  async findByFirebaseUid(uid) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM users WHERE firebase_uid = ${uid} LIMIT 1`;
    return rows[0] || null;
  },
  async findByPhone(phone) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM users WHERE phone = ${phone} LIMIT 1`;
    return rows[0] || null;
  },
  async create({ id, name, email, phone, passwordHash }) {
    await ensureSchema();
    await sql`INSERT INTO users (id, name, email, phone, password_hash, signin_provider)
      VALUES (${id}, ${name}, ${email.toLowerCase()}, ${phone || ''}, ${passwordHash}, 'password')`;
  },
  async createPasswordlessUser({ id, name, email, phone, firebaseUid, picture, provider }) {
    await ensureSchema();
    await sql`INSERT INTO users (id, name, email, phone, firebase_uid, picture, signin_provider)
      VALUES (${id}, ${name}, ${email ? email.toLowerCase() : null}, ${phone || ''}, ${firebaseUid}, ${picture || null}, ${provider || null})`;
  },
  async linkFirebaseUid(id, firebaseUid, provider) {
    await ensureSchema();
    await sql`UPDATE users SET firebase_uid = ${firebaseUid}, signin_provider = ${provider || null} WHERE id = ${id}`;
  },
  async listAll() {
    await ensureSchema();
    return sql`SELECT * FROM users ORDER BY created_at DESC`;
  },
  async setResetToken(id, token, expiresAt) {
    await ensureSchema();
    await sql`UPDATE users SET reset_token = ${token}, reset_token_expires = ${expiresAt.toISOString()} WHERE id = ${id}`;
  },
  async findByResetToken(token) {
    await ensureSchema();
    const rows = await sql`SELECT * FROM users WHERE reset_token = ${token} LIMIT 1`;
    return rows[0] || null;
  },
  async updatePassword(id, passwordHash) {
    await ensureSchema();
    await sql`UPDATE users SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL WHERE id = ${id}`;
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
  async findByFirebaseUid(uid) {
    const users = readUsersFile();
    return users.find(u => u.firebase_uid === uid) || null;
  },
  async findByPhone(phone) {
    const users = readUsersFile();
    return users.find(u => u.phone && u.phone === phone) || null;
  },
  async create({ id, name, email, phone, passwordHash }) {
    const users = readUsersFile();
    users.push({
      id, name, email: email.toLowerCase(), phone: phone || '', password_hash: passwordHash,
      signin_provider: 'password', created_at: new Date().toISOString(),
    });
    writeUsersFile(users);
  },
  async createPasswordlessUser({ id, name, email, phone, firebaseUid, picture, provider }) {
    const users = readUsersFile();
    users.push({
      id, name, email: email ? email.toLowerCase() : null, phone: phone || '',
      password_hash: null, firebase_uid: firebaseUid, picture: picture || null,
      signin_provider: provider || null, created_at: new Date().toISOString(),
    });
    writeUsersFile(users);
  },
  async linkFirebaseUid(id, firebaseUid, provider) {
    const users = readUsersFile();
    const user = users.find(u => u.id === id);
    if (user) { user.firebase_uid = firebaseUid; user.signin_provider = provider || null; writeUsersFile(users); }
  },
  async listAll() {
    return [...readUsersFile()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  async setResetToken(id, token, expiresAt) {
    const users = readUsersFile();
    const user = users.find(u => u.id === id);
    if (user) { user.reset_token = token; user.reset_token_expires = expiresAt.toISOString(); writeUsersFile(users); }
  },
  async findByResetToken(token) {
    const users = readUsersFile();
    return users.find(u => u.reset_token === token) || null;
  },
  async updatePassword(id, passwordHash) {
    const users = readUsersFile();
    const user = users.find(u => u.id === id);
    if (user) {
      user.password_hash = passwordHash;
      user.reset_token = null;
      user.reset_token_expires = null;
      writeUsersFile(users);
    }
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
      if (!row.password_hash) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'This account signs in with Google or phone OTP — please use that instead.' }));
      }
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Invalid email or password.' }));
      }
      return res.end(JSON.stringify({ token: signToken(row), user: publicUser(row) }));
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const { email } = await readBody(req);
      const genericMessage = "If an account exists for that email, we've sent a password reset link.";
      if (!isValidEmail(email)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Please provide a valid email.' }));
      }
      const row = await store.findByEmail(email);
      // Always respond the same way whether or not the account exists,
      // so this endpoint can't be used to enumerate registered emails.
      if (row) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await store.setResetToken(row.id, token, expiresAt);
        const host = req.headers.host || 'localhost';
        const resetUrl = `https://${host}/reset-password.html?token=${token}`;
        await sendPasswordResetEmail({ to: row.email, name: row.name, resetUrl });
      }
      return res.end(JSON.stringify({ message: genericMessage }));
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const { token, newPassword } = await readBody(req);
      if (!token || !newPassword || newPassword.length < 6) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Please provide the reset token and a password of at least 6 characters.' }));
      }
      const row = await store.findByResetToken(token);
      if (!row || !row.reset_token_expires || new Date(row.reset_token_expires) < new Date()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'This reset link is invalid or has expired. Please request a new one.' }));
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await store.updatePassword(row.id, passwordHash);
      return res.end(JSON.stringify({ success: true }));
    }

    if (pathname === '/api/auth/email-otp/send' && method === 'POST') {
      const { email } = await readBody(req);
      if (!isValidEmail(email)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Please provide a valid email.' }));
      }
      const normalizedEmail = email.toLowerCase();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await emailOtpStore.save(normalizedEmail, code, expiresAt);
      const emailResult = await sendEmailOtp({ to: normalizedEmail, code });
      if (!emailResult.sent) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: 'Could not send the code right now. Please try again shortly.' }));
      }
      return res.end(JSON.stringify({ message: 'A one-time code has been sent to your email.' }));
    }

    if (pathname === '/api/auth/email-otp/verify' && method === 'POST') {
      const { email, code } = await readBody(req);
      if (!isValidEmail(email) || !code) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Please provide your email and the code.' }));
      }
      const normalizedEmail = email.toLowerCase();
      const record = await emailOtpStore.get(normalizedEmail);
      if (!record || record.code !== String(code).trim() || new Date(record.expires_at) < new Date()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'That code is incorrect or has expired. Please request a new one.' }));
      }
      await emailOtpStore.remove(normalizedEmail);

      let row = await store.findByEmail(normalizedEmail);
      if (!row) {
        const id = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const name = normalizedEmail.split('@')[0];
        await store.createPasswordlessUser({ id, name, email: normalizedEmail, phone: '', firebaseUid: null, picture: null, provider: 'email_otp' });
        row = await store.findById(id);
      }
      return res.end(JSON.stringify({ token: signToken(row), user: publicUser(row) }));
    }

    if (pathname === '/api/auth/firebase' && method === 'POST') {
      const { idToken } = await readBody(req);
      let payload;
      try {
        payload = await verifyFirebaseIdToken(idToken);
      } catch (err) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Could not verify sign-in. Please try again.' }));
      }

      const firebaseUid = payload.sub;
      const email = payload.email ? payload.email.toLowerCase() : null;
      const phone = payload.phone_number || '';
      const provider = (payload.firebase && payload.firebase.sign_in_provider) || null;

      let row = await store.findByFirebaseUid(firebaseUid);

      if (!row && email) {
        row = await store.findByEmail(email);
        if (row) await store.linkFirebaseUid(row.id, firebaseUid, provider);
      }
      if (!row && phone) {
        row = await store.findByPhone(phone);
        if (row) await store.linkFirebaseUid(row.id, firebaseUid, provider);
      }

      if (!row) {
        const id = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const name = payload.name || (email ? email.split('@')[0] : 'Customer');
        await store.createPasswordlessUser({ id, name, email, phone, firebaseUid, picture: payload.picture, provider });
        row = await store.findById(id);
      }

      return res.end(JSON.stringify({ token: signToken(row), user: publicUser(row) }));
    }

    if (pathname === '/api/auth/users' && method === 'GET') {
      if (!isAdmin(req)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Admin access required.' }));
      }
      const rows = await store.listAll();
      const addresses = await getLatestAddressesByUserId();
      const users = rows.map(r => {
        const latest = addresses.get(r.id);
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone || '',
          address: latest ? latest.address : '',
          pincode: latest ? latest.pincode : '',
          signInMethod: r.signin_provider === 'google.com' ? 'Google'
            : r.signin_provider === 'phone' ? 'Phone OTP'
            : r.signin_provider === 'email_otp' ? 'Email OTP'
            : r.signin_provider === 'password' ? 'Email & Password'
            : r.password_hash ? 'Email & Password' : 'Unknown',
          createdAt: r.created_at,
        };
      });
      return res.end(JSON.stringify(users));
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
