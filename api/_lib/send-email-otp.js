// Sends a one-time login code via Resend. Same no-op-when-unconfigured
// behavior as the other transactional emails on this site.

export async function sendEmailOtp({ to, code }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email OTP for', to);
    return { sent: false, reason: 'not_configured' };
  }
  if (!to) return { sent: false, reason: 'no_email' };

  const fromAddress = process.env.RESEND_FROM || 'PRIZMORAA <onboarding@resend.dev>';
  const html = `
    <div style="font-family:Georgia,serif; max-width:520px; margin:0 auto; color:#3A2A1D;">
      <h1 style="font-size:22px; letter-spacing:0.1em;">PRIZMORAA</h1>
      <p>Your one-time sign-in code is:</p>
      <p style="font-size:36px; font-weight:bold; letter-spacing:0.15em; margin:20px 0;">${code}</p>
      <p style="font-size:13px; color:#5C483A;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
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
        subject: `${code} is your PRIZMORAA sign-in code`,
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
    console.error('Failed to send email OTP', err);
    return { sent: false, reason: 'exception' };
  }
}
