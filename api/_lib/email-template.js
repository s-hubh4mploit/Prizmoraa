// Shared branded shell for customer-facing transactional emails, matching
// the site's own design tokens (css/design-system.css: ivory/espresso/gold,
// Cormorant Garamond + Jost) so order confirmations, OTP codes, and
// back-in-stock notices all look like the same site sent them. Web fonts
// are progressive enhancement only — every element also carries a solid
// system-font fallback, since many email clients (Outlook desktop in
// particular) strip <style>/@import entirely.
export function renderEmailShell(bodyHtml) {
  return `
    <div style="background:#FBF7F1; padding:32px 16px; font-family:'Jost',Arial,Helvetica,sans-serif;">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@300;400;500&display=swap');
      </style>
      <div style="max-width:520px; margin:0 auto; background:#FFFFFF; border:1px solid #E9DCC7; border-radius:6px; overflow:hidden;">
        <div style="background:#3A2A1D; padding:26px 32px; text-align:center;">
          <span style="font-family:'Cormorant Garamond',Georgia,serif; font-size:24px; letter-spacing:0.14em; color:#FBF7F1;">PRIZMORAA</span>
        </div>
        <div style="padding:32px; color:#3A2A1D; font-size:15px; line-height:1.65;">
          ${bodyHtml}
        </div>
        <div style="padding:18px 32px; border-top:1px solid #E9DCC7; text-align:center;">
          <span style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#5C483A;">Wear Your Shine</span>
        </div>
      </div>
    </div>
  `;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
