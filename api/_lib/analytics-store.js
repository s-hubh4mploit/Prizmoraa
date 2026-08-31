// Lightweight first-party page-view tracking for the admin dashboard's
// analytics panel. Same dual Postgres/file-store pattern as the rest of the
// API. Visitor identity is just a random id the browser generates and keeps
// in localStorage (js/main.js) — no cookies, no third-party script, no PII.
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql, hasDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let schemaReady = null;
async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = sql`CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      path TEXT NOT NULL,
      referrer TEXT,
      created_at TEXT NOT NULL
    )`;
  }
  await schemaReady;
}

// Builds a 7-entry [oldest..today] series, filling in days with no rows.
function fillLast7Days(rows) {
  const byDay = new Map(rows.map(r => [r.day, { views: Number(r.views) || 0, visitors: Number(r.visitors) || 0 }]));
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay.get(key) || { views: 0, visitors: 0 };
    series.push({ date: key, ...entry });
  }
  return series;
}

const pgStore = {
  async logVisit({ visitorId, path: pagePath, referrer }) {
    await ensureSchema();
    await sql`INSERT INTO page_views (visitor_id, path, referrer, created_at) VALUES (${visitorId}, ${pagePath}, ${referrer || null}, ${new Date().toISOString()})`;
  },
  async getSummary() {
    await ensureSchema();
    const [totals] = await sql`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors FROM page_views`;
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [today] = await sql`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors FROM page_views WHERE created_at >= ${startOfToday.toISOString()}`;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    // created_at is always written as an ISO 8601 UTC string, so its first
    // 10 characters are already the YYYY-MM-DD day bucket.
    const dailyRows = await sql`
      SELECT substr(created_at, 1, 10) AS day,
        COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
      FROM page_views
      WHERE created_at >= ${sevenDaysAgo.toISOString()}
      GROUP BY day ORDER BY day`;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const topPages = await sql`
      SELECT path, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= ${thirtyDaysAgo.toISOString()}
      GROUP BY path ORDER BY views DESC LIMIT 8`;
    return {
      totalViews: totals.views, totalVisitors: totals.visitors,
      viewsToday: today.views, visitorsToday: today.visitors,
      last7Days: fillLast7Days(dailyRows),
      topPages: topPages.map(r => ({ path: r.path, views: r.views })),
    };
  },
};

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_page_views.json');
const LOCK_FILE = path.join(DATA_DIR, 'prizmoraa_page_views.lock');

function withLock(callback) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > 3000) throw new Error('Could not acquire lock');
  }
  fs.writeFileSync(LOCK_FILE, process.pid ? process.pid.toString() : 'lock', 'utf8');
  try { return callback(); } finally { try { fs.unlinkSync(LOCK_FILE); } catch (e) {} }
}

function readFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeFileData(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  return withLock(() => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'));
}

const fileStore = {
  async logVisit({ visitorId, path: pagePath, referrer }) {
    const all = readFile();
    all.push({ visitor_id: visitorId, path: pagePath, referrer: referrer || null, created_at: new Date().toISOString() });
    writeFileData(all);
  },
  async getSummary() {
    const all = readFile();
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const totalViews = all.length;
    const totalVisitors = new Set(all.map(r => r.visitor_id)).size;

    const todayRows = all.filter(r => new Date(r.created_at) >= startOfToday);
    const viewsToday = todayRows.length;
    const visitorsToday = new Set(todayRows.map(r => r.visitor_id)).size;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const recentRows = all.filter(r => new Date(r.created_at) >= sevenDaysAgo);
    const byDay = new Map();
    recentRows.forEach(r => {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      const entry = byDay.get(key) || { views: 0, visitorSet: new Set() };
      entry.views += 1;
      entry.visitorSet.add(r.visitor_id);
      byDay.set(key, entry);
    });
    const dailyRows = Array.from(byDay.entries()).map(([day, v]) => ({ day, views: v.views, visitors: v.visitorSet.size }));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const monthRows = all.filter(r => new Date(r.created_at) >= thirtyDaysAgo);
    const byPath = new Map();
    monthRows.forEach(r => byPath.set(r.path, (byPath.get(r.path) || 0) + 1));
    const topPages = Array.from(byPath.entries())
      .map(([p, views]) => ({ path: p, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);

    return {
      totalViews, totalVisitors, viewsToday, visitorsToday,
      last7Days: fillLast7Days(dailyRows),
      topPages,
    };
  },
};

const store = hasDb ? pgStore : fileStore;
export default store;
