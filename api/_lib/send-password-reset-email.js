// Sends a password-reset email via the Resend API. Same no-op-when-
// unconfigured behavior as send-order-email.js, so the forgot-password
// endpoint never crashes — it just can't actually deliver the email yet.

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping password reset email for', to);
    return { sent: false, reason: 'not_configured' };
  }
  if (!to) return { sent: false, reason: 'no_email' };

  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const html = `
    <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D;">
      <h1 style="font-size:22px; letter-spacing:0.1em;">PRIZMORAA</h1>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>We received a request to reset your password. Click the button below to choose a new one — this link expires in 1 hour.</p>
      <p style="margin:28px 0;">
        <a href="${resetUrl}" style="background:#3A2A1D; color:#FBF7F1; padding:14px 28px; text-decoration:none; letter-spacing:0.08em; text-transform:uppercase; font-size:13px; font-family:Georgia,serif;">Reset Password</a>
      </p>
      <p style="font-size:13px; color:#5C483A;">If you didn't request this, you can safely ignore this email — your password will stay the same.</p>
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
        subject: 'Reset your PRIZMORAA password',
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
    console.error('Failed to send password reset email', err);
    return { sent: false, reason: 'exception' };
  }
}
