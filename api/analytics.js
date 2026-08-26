// Admin-only summary of the page views recorded by /api/track-visit.
import analyticsStore from './_lib/analytics-store.js';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY_V2 || process.env.ADMIN_API_KEY;
function isAdmin(req) {
  if (!ADMIN_API_KEY) return false;
  return req.headers['x-admin-key'] === ADMIN_API_KEY;
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

export default async (req, res) => {
  setJsonHeaders(res);
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  if (!isAdmin(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Admin access required.' }));
  }

  try {
    const summary = await analyticsStore.getSummary();
    return res.end(JSON.stringify(summary));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Server error', message: err.message }));
  }
};
