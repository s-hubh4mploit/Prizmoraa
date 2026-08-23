// Sends a contact-form message via Resend to the site's inbox. Public and
// unauthenticated by nature (anyone should be able to reach out), so it's
// rate-limited per IP the same way admin-login is, to stop it being used to
// spam/email-bomb the destination inbox.
import rateLimitStore from './_lib/rate-limit-store.js';

const CONTACT_INBOX = 'helloprizmoraa@gmail.com';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    setJsonHeaders(res);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const key = `contact:${getClientIp(req)}`;

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { locked, retryAfterMs } = await rateLimitStore.isLocked(key);
      if (locked) {
        res.statusCode = 429;
        setJsonHeaders(res);
        return res.end(JSON.stringify({
          error: 'Too many messages sent. Please try again in a few minutes.',
          retryAfterMs,
        }));
      }

      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        parsed = {};
      }
      const name = String(parsed.name || '').trim().slice(0, 200);
      const email = String(parsed.email || '').trim().slice(0, 200);
      const message = String(parsed.message || '').trim().slice(0, 5000);

      if (!name || !email || !message || !isValidEmail(email)) {
        res.statusCode = 400;
        setJsonHeaders(res);
        return res.end(JSON.stringify({ error: 'Please fill in your name, a valid email, and a message.' }));
      }

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        res.statusCode = 500;
        setJsonHeaders(res);
        return res.end(JSON.stringify({ error: 'Contact form is not configured yet. Please email us directly.' }));
      }

      const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
      const html = `
        <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D;">
          <h1 style="font-size:20px; letter-spacing:0.08em;">New Contact Form Message</h1>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: CONTACT_INBOX,
          reply_to: email,
          subject: `New message from ${name} — PRIZMORAA Contact Form`,
          html,
        }),
      });

      await rateLimitStore.recordFailure(key, { maxAttempts: 5, lockMs: 10 * 60 * 1000, windowMs: 15 * 60 * 1000 });

      if (!emailRes.ok) {
        const text = await emailRes.text();
        console.error('Resend API error', emailRes.status, text);
        res.statusCode = 502;
        setJsonHeaders(res);
        return res.end(JSON.stringify({ error: 'Could not send your message right now. Please try again or email us directly.' }));
      }

      setJsonHeaders(res);
      return res.end(JSON.stringify({ sent: true }));
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      setJsonHeaders(res);
      return res.end(JSON.stringify({ error: 'Server error' }));
    }
  });
};
