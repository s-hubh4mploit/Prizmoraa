// "Notify me when back in stock" — customers must be signed in (their
// email comes from their account, never trusted from the request body).
import { getUserFromRequest } from './auth.js';
import stockNotifyStore from './_lib/stock-notify-store.js';

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
  const { method, url } = req;
  const host = req.headers.host || 'localhost';
  const pathname = new URL(url, `http://${host}`).pathname;
  setJsonHeaders(res);

  try {
    if (pathname !== '/api/notify-stock') {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not found' }));
    }

    const user = await getUserFromRequest(req);
    if (!user) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: 'Please sign in to get notified when this is back in stock.' }));
    }

    if (method === 'POST') {
      const { productId } = await readBody(req);
      if (!productId || typeof productId !== 'string') {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing product id.' }));
      }
      if (!user.email) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Your account has no email on file, so we can\'t notify you. Please add one to your profile.' }));
      }
      await stockNotifyStore.subscribe(productId, user.id, user.email);
      return res.end(JSON.stringify({ subscribed: true }));
    }

    if (method === 'GET') {
      const productId = new URL(url, `http://${host}`).searchParams.get('productId');
      if (!productId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing product id.' }));
      }
      const subscribed = await stockNotifyStore.isSubscribed(productId, user.id);
      return res.end(JSON.stringify({ subscribed }));
    }

    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    setJsonHeaders(res);
    return res.end(JSON.stringify({ error: 'Server error', message: err.message }));
  }
};
