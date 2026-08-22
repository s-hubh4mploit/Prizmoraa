// Server-side admin login. Verifies the admin username/password without ever
// shipping them to the browser, then hands back the ADMIN_API_KEY the client
// needs to call other admin-only endpoints. Backed by rate-limit-store so
// brute-forcing this endpoint is actually blocked server-side, not just by a
// client-side counter (which anyone can bypass by reloading the page).
import rateLimitStore from './_lib/rate-limit-store.js';

// Falls back to the site's current credentials if the env vars aren't set yet,
// so behavior (and the actual password value) is unchanged unless/until the
// site owner rotates it via Vercel env vars.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Prizmoraa2026';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY_V2 || process.env.ADMIN_API_KEY;

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

export default async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    setJsonHeaders(res);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  if (!ADMIN_API_KEY) {
    res.statusCode = 500;
    setJsonHeaders(res);
    return res.end(JSON.stringify({ error: 'Admin login is not configured on the server.' }));
  }

  const key = `admin-login:${getClientIp(req)}`;

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { locked, retryAfterMs } = await rateLimitStore.isLocked(key);
      if (locked) {
        res.statusCode = 429;
        setJsonHeaders(res);
        return res.end(JSON.stringify({
          error: 'Too many failed attempts. Please try again in a few minutes.',
          retryAfterMs,
        }));
      }

      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        parsed = {};
      }
      const username = String(parsed.username || '').trim().toLowerCase();
      const password = String(parsed.password || '').trim();

      if (username === ADMIN_USERNAME.toLowerCase() && password === ADMIN_PASSWORD) {
        await rateLimitStore.clearAttempts(key);
        setJsonHeaders(res);
        return res.end(JSON.stringify({ apiKey: ADMIN_API_KEY }));
      }

      await rateLimitStore.recordFailure(key);
      res.statusCode = 401;
      setJsonHeaders(res);
      return res.end(JSON.stringify({ error: 'Invalid username or password.' }));
    } catch (err) {
      res.statusCode = 500;
      setJsonHeaders(res);
      return res.end(JSON.stringify({ error: 'Server error' }));
    }
  });
};
