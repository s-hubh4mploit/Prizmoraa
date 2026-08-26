// Public, fire-and-forget page-view beacon (called by js/main.js on every
// storefront page load — never on admin.html, since that file doesn't
// include main.js). Always responds fast and never throws back at the
// visitor's page; a tracking failure must never be visible to a customer.
import analyticsStore from './_lib/analytics-store.js';

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async (req, res) => {
  setJsonHeaders(res);
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const body = await readBody(req);
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId.slice(0, 100) : '';
    const pagePath = typeof body.path === 'string' ? body.path.slice(0, 300) : '';
    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 300) : '';

    if (!visitorId || !pagePath) {
      res.statusCode = 204;
      return res.end();
    }

    await analyticsStore.logVisit({ visitorId, path: pagePath, referrer });
    res.statusCode = 204;
    return res.end();
  } catch (err) {
    // Best-effort only — swallow errors so a tracking hiccup never surfaces
    // to the visitor or shows up as a failed request in dev tools.
    res.statusCode = 204;
    return res.end();
  }
};
