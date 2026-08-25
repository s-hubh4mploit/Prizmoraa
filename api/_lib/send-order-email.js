// Sends order emails via the Resend API (https://resend.com): a confirmation
// to the customer, and a notification to the store's own inbox so the owner
// knows a new order came in without having to keep checking the admin
// dashboard (this replaced the old automatic WhatsApp popup). Both no-op
// (log a warning) when RESEND_API_KEY isn't configured, so checkout never
// fails just because email isn't set up yet.

import { renderEmailShell, escapeHtml } from './email-template.js';

const ADMIN_NOTIFICATION_EMAIL = 'helloprizmoraa@gmail.com';

async function sendEmail({ apiKey, fromAddress, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Resend API error', res.status, text);
    return { sent: false, reason: 'api_error' };
  }
  return { sent: true };
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
    `<tr><td style="padding:10px 0; border-bottom:1px solid #F4EDE2;">${escapeHtml(i.name)} × ${i.qty}</td><td style="padding:10px 0; border-bottom:1px solid #F4EDE2; text-align:right;">₹${(i.price * i.qty).toLocaleString('en-IN')}</td></tr>`
  ).join('');

  const html = renderEmailShell(`
    <p style="font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; color:#B08A4E; margin:0 0 4px;">Order Confirmed</p>
    <p>Hi ${escapeHtml(order.name)},</p>
    <p>Thank you for your order — here's your confirmation.</p>
    <table style="width:100%; border-collapse:collapse; margin:20px 0;">${lines}</table>
    <p style="font-family:'Cormorant Garamond',Georgia,serif; font-size:19px; font-weight:600; text-align:right; margin:0 0 20px;">Total: ₹${Number(order.total).toLocaleString('en-IN')}</p>
    <p style="font-size:13px; color:#5C483A;">Order ID: ${escapeHtml(order.id)}<br>Payment ID: ${escapeHtml(order.paymentId || 'N/A')}</p>
    <p style="font-size:13px; color:#5C483A;">Shipping to:<br>${escapeHtml(order.address)}, ${escapeHtml(order.pincode)}</p>
    <p style="margin-top:24px; font-size:13px; color:#5C483A;">We'll email you with delivery updates. Thank you for shopping with PRIZMORAA.</p>
  `);

  try {
    return await sendEmail({
      apiKey, fromAddress, to: order.email,
      subject: `Your PRIZMORAA order is confirmed — ${order.id}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send order email', err);
    return { sent: false, reason: 'exception' };
  }
}

// Notifies the store's own inbox of a new paid order — the store-owner-facing
// counterpart to sendOrderConfirmationEmail above, which is customer-facing.
export async function sendAdminOrderNotificationEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping admin order notification for order', order.id);
    return { sent: false, reason: 'not_configured' };
  }

  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const itemRows = order.items.map(i =>
    `<tr><td style="padding:6px 0;">${escapeHtml(i.name)}</td><td style="padding:6px 0; text-align:center;">${i.qty}</td><td style="padding:6px 0; text-align:right;">₹${(i.price * i.qty).toLocaleString('en-IN')}</td></tr>`
  ).join('');
  const placedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

  const html = `
    <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D;">
      <h1 style="font-size:20px; letter-spacing:0.08em;">New Order Received</h1>
      <p style="font-size:13px; color:#5C483A;">Placed ${escapeHtml(placedAt)} IST</p>

      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <thead>
          <tr style="border-bottom:1px solid #E5DCCF; text-align:left;">
            <th style="padding:6px 0; font-size:12px; text-transform:uppercase;">Item</th>
            <th style="padding:6px 0; font-size:12px; text-transform:uppercase; text-align:center;">Qty</th>
            <th style="padding:6px 0; font-size:12px; text-transform:uppercase; text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
        <tr><td>Subtotal</td><td style="text-align:right;">₹${Number(order.subtotal ?? 0).toLocaleString('en-IN')}</td></tr>
        ${order.discountAmount > 0 ? `<tr><td>Discount</td><td style="text-align:right;">−₹${Number(order.discountAmount).toLocaleString('en-IN')}</td></tr>` : ''}
        <tr><td>Shipping</td><td style="text-align:right;">₹${Number(order.shippingCharge ?? 0).toLocaleString('en-IN')}</td></tr>
        <tr style="font-weight:bold;"><td>Total</td><td style="text-align:right;">₹${Number(order.total).toLocaleString('en-IN')}</td></tr>
      </table>

      <p><strong>Order ID:</strong> ${escapeHtml(order.id)}<br><strong>Payment ID:</strong> ${escapeHtml(order.paymentId || 'N/A')}</p>

      <p><strong>Customer</strong><br>
      ${escapeHtml(order.name)}<br>
      ${escapeHtml(order.email || 'No email provided')}<br>
      ${escapeHtml(order.phone)}</p>

      <p><strong>Ship to</strong><br>
      ${escapeHtml(order.address)}, ${escapeHtml(order.pincode)}</p>
    </div>
  `;

  try {
    return await sendEmail({
      apiKey, fromAddress, to: ADMIN_NOTIFICATION_EMAIL,
      subject: `New order — ${order.name} — ₹${Number(order.total).toLocaleString('en-IN')} (${order.id})`,
      html,
    });
  } catch (err) {
    console.error('Failed to send admin order notification email', err);
    return { sent: false, reason: 'exception' };
  }
}
