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

  // Kept deliberately plain — no colored button, no "Shop Now"/urgency
  // language, minimal styling. Gmail's Promotions-tab classifier weighs
  // exactly those signals heavily; a plain, personal-reading email is more
  // likely (though never guaranteed — Gmail doesn't expose any way for a
  // sender to force Primary-tab placement) to land in the primary inbox.
  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const html = `
    <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D; font-size:15px; line-height:1.6;">
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>You asked to be notified when ${escapeHtml(productName)} was available again — it's back in stock now.</p>
      <p><a href="${productUrl}" style="color:#3A2A1D;">${escapeHtml(productUrl)}</a></p>
      <p>Thanks,<br>PRIZMORAA</p>
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
        subject: `${productName} is available again`,
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
