import settingsStore from './_lib/settings-store.js';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY_V2 || process.env.ADMIN_API_KEY;

function isAdmin(req) {
  if (!ADMIN_API_KEY) return false;
  return req.headers['x-admin-key'] === ADMIN_API_KEY;
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
  setJsonHeaders(res);
  try {
    // Publicly readable — the checkout page needs this to show the
    // shipping/discount breakdown before a customer pays.
    if (req.method === 'GET') {
      const settings = await settingsStore.get();
      return res.end(JSON.stringify(settings));
    }

    if (req.method === 'POST') {
      if (!isAdmin(req)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Admin access required.' }));
      }
      const body = await readBody(req);
      const shippingCharge = Math.max(0, Number(body.shippingCharge) || 0);
      const discountPercent = Math.min(100, Math.max(0, Number(body.discountPercent) || 0));
      const saved = await settingsStore.set({ shippingCharge, discountPercent });
      return res.end(JSON.stringify(saved));
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Server error', message: err.message }));
  }
};
