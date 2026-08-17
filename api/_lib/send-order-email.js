// Sends an order confirmation email via the Resend API (https://resend.com).
// No-ops (logs a warning) when RESEND_API_KEY isn't configured, so checkout
// never fails just because email isn't set up yet.

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendOrderConfirmationEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping order confirmation email for order', order.id);
    return { sent: false, reason: 'not_configured' };
  }
  if (!order.email) {
    return { sent: false, reason: 'no_email' };
  }

  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const lines = order.items.map(i =>
    `<tr><td style="padding:8px 0;">${escapeHtml(i.name)} × ${i.qty}</td><td style="padding:8px 0; text-align:right;">₹${(i.price * i.qty).toLocaleString('en-IN')}</td></tr>`
  ).join('');

  const html = `
    <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D;">
      <h1 style="font-size:22px; letter-spacing:0.1em;">PRIZMORAA</h1>
      <p>Hi ${escapeHtml(order.name)},</p>
      <p>Thank you for your order! Here's your confirmation:</p>
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">${lines}</table>
      <p style="font-weight:bold;">Total: ₹${Number(order.total).toLocaleString('en-IN')}</p>
      <p>Order ID: ${escapeHtml(order.id)}<br>Payment ID: ${escapeHtml(order.paymentId || 'N/A')}</p>
      <p>Shipping to:<br>${escapeHtml(order.address)}, ${escapeHtml(order.pincode)}</p>
      <p style="margin-top:24px; font-size:13px; color:#5C483A;">We'll be in touch on WhatsApp with delivery updates. Thank you for shopping with PRIZMORAA.</p>
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
        to: order.email,
        subject: `Your PRIZMORAA order is confirmed — ${order.id}`,
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
    console.error('Failed to send order email', err);
    return { sent: false, reason: 'exception' };
  }
}
