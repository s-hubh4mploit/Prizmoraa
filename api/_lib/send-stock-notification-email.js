// Sends a "back in stock" email via Resend when a subscribed product's
// stock goes from 0 to available again. No-ops (logs a warning) when
// RESEND_API_KEY isn't configured.
import { renderEmailShell, escapeHtml } from './email-template.js';

export async function sendBackInStockEmail({ to, name, productName, productUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping back-in-stock email for', to);
    return { sent: false, reason: 'not_configured' };
  }

  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const escapedProduct = escapeHtml(productName);
  const html = renderEmailShell(`
    <p>Hi ${escapeHtml(name || 'there')},</p>
    <p>The wait is over. ✨</p>
    <p>Your <strong>${escapedProduct}</strong> is back in stock — and ready to find its way to you.</p>
    <p>A delicate little reminder that some pieces are worth waiting for. 🤍</p>
    <p style="margin:28px 0; text-align:center;">
      <a href="${productUrl}" style="background:#3A2A1D; color:#FBF7F1; padding:14px 28px; text-decoration:none; letter-spacing:0.08em; text-transform:uppercase; font-size:13px; font-family:'Jost',Arial,Helvetica,sans-serif; display:inline-block;">Shop ${escapedProduct}</a>
    </p>
    <p>With love,<br>PRIZMORAA</p>
  `);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to,
        subject: `${productName} is Back ✨`,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Resend API error', res.status, text);
      return { sent: false, reason: 'api_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('Failed to send back-in-stock email', err);
    return { sent: false, reason: 'exception' };
  }
}
