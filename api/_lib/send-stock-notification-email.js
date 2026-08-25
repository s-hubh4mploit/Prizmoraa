// Sends a "back in stock" email via Resend when a subscribed product's
// stock goes from 0 to available again. No-ops (logs a warning) when
// RESEND_API_KEY isn't configured.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendBackInStockEmail({ to, name, productName, productUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping back-in-stock email for', to);
    return { sent: false, reason: 'not_configured' };
  }

  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const html = `
    <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D;">
      <h1 style="font-size:22px; letter-spacing:0.1em;">PRIZMORAA</h1>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Good news — <strong>${escapeHtml(productName)}</strong> is back in stock!</p>
      <p style="margin:24px 0;">
        <a href="${productUrl}" style="display:inline-block; background:#3A2A1D; color:#F7F1E8; padding:14px 28px; text-decoration:none; letter-spacing:0.08em; text-transform:uppercase; font-size:13px;">Shop Now</a>
      </p>
      <p style="font-size:13px; color:#5C483A;">Stock is limited, so grab it before it sells out again.</p>
    </div>
  `;

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
        subject: `${productName} is back in stock — PRIZMORAA`,
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
