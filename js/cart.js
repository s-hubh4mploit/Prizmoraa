// js/cart.js — cart, wishlist, search, account, checkout (Razorpay + WhatsApp)
import { signInWithGoogle, setupRecaptcha, sendPhoneOtp, confirmPhoneOtp, firebaseConfigured } from './firebase-auth.js';

const CART_KEY = 'prizmoraa_cart_v1';
const WISHLIST_KEY = 'prizmoraa_wishlist_v1';
const PROFILE_KEY = 'prizmoraa_profile_v1';

const WHATSAPP_LINK = 'https://wa.me/message/JSHTXWJK5W6UK1';

const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const $ = (sel, root = document) => root.querySelector(sel);

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch { return fallback; }
}
function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ---------------- CART ---------------- */
function getCart() { return readJSON(CART_KEY, []); }
function saveCart(cart) { writeJSON(CART_KEY, cart); renderBadges(); renderCartDrawer(); }

// stock is null/undefined when unknown (e.g. items added via wishlist, which
// doesn't track stock) — treated as unlimited so existing flows keep working.
let stockLimitNotice = null;

function addToCart(item, qty = 1) {
  const cart = getCart();
  const stock = item.stock === undefined || item.stock === null || item.stock === '' ? null : Math.max(0, Number(item.stock) || 0);
  const existing = cart.find(i => i.id === item.id);

  if (existing) {
    if (stock !== null) existing.stock = stock;
    const currentQty = existing.qty;
    const room = stock === null ? qty : Math.max(0, stock - currentQty);
    const toAdd = Math.min(qty, room);
    existing.qty = currentQty + toAdd;
    if (toAdd < qty) {
      stockLimitNotice = { id: item.id, message: stock > 0 ? `Only ${stock} in stock — that's the most you can add.` : 'This piece is out of stock.' };
    }
  } else {
    const toAdd = stock === null ? qty : Math.min(qty, stock);
    if (toAdd <= 0) {
      stockLimitNotice = { id: item.id, message: 'This piece is out of stock.' };
      openPanel('cart');
      return;
    }
    cart.push({ id: item.id, name: item.name, price: Number(item.price), image: item.image, qty: toAdd, stock });
    if (toAdd < qty) {
      stockLimitNotice = { id: item.id, message: `Only ${stock} in stock — that's the most you can add.` };
    }
  }

  saveCart(cart);
  openPanel('cart');
}
function removeFromCart(id) { saveCart(getCart().filter(i => i.id !== id)); }
function setQty(id, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const max = item.stock === undefined || item.stock === null ? Infinity : item.stock;
  if (qty > max) {
    stockLimitNotice = { id, message: `Only ${max} in stock — that's the most you can add.` };
    qty = max;
  }
  item.qty = Math.max(1, qty);
  saveCart(cart);
}
function cartTotal() { return getCart().reduce((s, i) => s + i.price * i.qty, 0); }
function cartCount() { return getCart().reduce((s, i) => s + i.qty, 0); }
function clearCart() { saveCart([]); }

/* ---------------- WISHLIST ---------------- */
function getWishlist() { return readJSON(WISHLIST_KEY, []); }
function saveWishlist(list) { writeJSON(WISHLIST_KEY, list); renderBadges(); renderWishlistDrawer(); }
function isWishlisted(id) { return getWishlist().some(i => i.id === id); }

function toggleWishlistItem(item) {
  let list = getWishlist();
  if (list.some(i => i.id === item.id)) list = list.filter(i => i.id !== item.id);
  else list.push({ id: item.id, name: item.name, price: Number(item.price), image: item.image });
  saveWishlist(list);
  $$(`[data-wishlist-id="${item.id}"]`).forEach(btn => btn.classList.toggle('active', isWishlisted(item.id)));
}

/* Called from product-card buttons via data-* attributes */
function addFromBtn(btn) {
  addToCart({ id: btn.dataset.id, name: btn.dataset.name, price: btn.dataset.price, image: btn.dataset.image, stock: btn.dataset.stock });
}
function wishlistFromBtn(btn) {
  toggleWishlistItem({ id: btn.dataset.id, name: btn.dataset.name, price: btn.dataset.price, image: btn.dataset.image });
}

/* ---------------- PROFILE (delivery details, saved on device) ---------------- */
function getProfile() { return readJSON(PROFILE_KEY, { name: '', email: '', phone: '', address: '', pincode: '' }); }
function saveProfile(p) { writeJSON(PROFILE_KEY, p); }

/* ---------------- BADGES ---------------- */
const ACCOUNT_ICON_SVG = '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

// Swaps the nav's account icon for a circle showing the customer's
// initial once they're logged in — a quick, unmistakable confirmation
// that sign-in actually worked, instead of the icon looking identical
// whether or not anyone is signed in.
function renderAccountIcon() {
  const auth = window.PrizmoraaAuth;
  const loggedIn = !!(auth && auth.isLoggedIn());
  const user = loggedIn ? auth.getUser() : null;
  $$('#accountToggleBtn').forEach(btn => {
    if (loggedIn && user) {
      const label = (user.name || user.email || '?').trim();
      const initial = label.charAt(0).toUpperCase() || '?';
      btn.innerHTML = `<span class="account-avatar">${initial}</span>`;
      btn.setAttribute('aria-label', `Account — logged in as ${label}`);
      btn.title = `Logged in as ${label}`;
    } else {
      btn.innerHTML = ACCOUNT_ICON_SVG;
      btn.setAttribute('aria-label', 'Account');
      btn.removeAttribute('title');
    }
  });
}

function renderBadges() {
  $$('#cartCount').forEach(el => el.textContent = cartCount());
  $$('#wishlistCount').forEach(el => el.textContent = getWishlist().length);
  renderAccountIcon();
}

/* ---------------- PANEL / DRAWER SHELL ---------------- */
function injectShell() {
  if ($('#prizPanelOverlay')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="priz-overlay" id="prizPanelOverlay"></div>

    <aside class="priz-panel" id="prizCartPanel" aria-hidden="true">
      <div class="priz-panel-head">
        <h3>Your Cart</h3>
        <button class="priz-close" data-close>&times;</button>
      </div>
      <div class="priz-panel-body" id="cartItemsWrap"></div>
      <div class="priz-panel-foot" id="cartFoot"></div>
    </aside>

    <aside class="priz-panel" id="prizWishlistPanel" aria-hidden="true">
      <div class="priz-panel-head">
        <h3>Wishlist</h3>
        <button class="priz-close" data-close>&times;</button>
      </div>
      <div class="priz-panel-body" id="wishlistItemsWrap"></div>
    </aside>

    <aside class="priz-panel" id="prizSearchPanel" aria-hidden="true">
      <div class="priz-panel-head">
        <h3>Search</h3>
        <button class="priz-close" data-close>&times;</button>
      </div>
      <div class="priz-panel-body">
        <input type="text" id="prizSearchInput" class="priz-input" placeholder="Search jewellery...">
        <div id="prizSearchResults"></div>
      </div>
    </aside>

    <aside class="priz-panel" id="prizAccountPanel" aria-hidden="true">
      <div class="priz-panel-head">
        <h3 id="accountPanelTitle">My Account</h3>
        <button class="priz-close" data-close>&times;</button>
      </div>
      <div class="priz-panel-body" id="accountPanelBody"></div>
    </aside>
  `;
  document.body.appendChild(div);

  $('#prizPanelOverlay').addEventListener('click', closeAllPanels);
  $$('[data-close]').forEach(b => b.addEventListener('click', closeAllPanels));

  $('#prizSearchInput').addEventListener('input', onSearchInput);
}

function openPanel(name) {
  closeAllPanels();
  const map = { cart: 'prizCartPanel', wishlist: 'prizWishlistPanel', search: 'prizSearchPanel', account: 'prizAccountPanel' };
  $('#prizPanelOverlay').classList.add('open');
  $(`#${map[name]}`).classList.add('open');
  document.body.classList.add('priz-lock');
  if (name === 'cart') renderCartDrawer();
  if (name === 'wishlist') renderWishlistDrawer();
  if (name === 'account') renderAccountPanel();
}
function closeAllPanels() {
  $$('.priz-panel').forEach(p => p.classList.remove('open'));
  $('#prizPanelOverlay')?.classList.remove('open');
  document.body.classList.remove('priz-lock');
}

/* ---------------- CART RENDER + CHECKOUT ---------------- */
function renderCartDrawer() {
  const wrap = $('#cartItemsWrap'); const foot = $('#cartFoot');
  if (!wrap) return;
  const cart = getCart();
  if (cart.length === 0) {
    wrap.innerHTML = '<p class="priz-empty">Your cart is empty.</p>';
    foot.innerHTML = '';
    return;
  }
  wrap.innerHTML = cart.map(i => {
    const atMax = i.stock !== undefined && i.stock !== null && i.qty >= i.stock;
    const notice = stockLimitNotice && stockLimitNotice.id === i.id ? stockLimitNotice.message : null;
    return `
    <div class="priz-line">
      <img src="${i.image}" alt="${i.name}">
      <div class="priz-line-info">
        <span class="priz-line-name">${i.name}</span>
        <span class="priz-line-price">₹${i.price.toLocaleString('en-IN')}</span>
        <div class="priz-qty">
          <button data-qty-down="${i.id}">−</button>
          <span>${i.qty}</span>
          <button data-qty-up="${i.id}" ${atMax ? 'disabled' : ''}>+</button>
        </div>
        ${notice ? `<span class="priz-stock-notice">${notice}</span>` : (atMax ? `<span class="priz-stock-notice">Our Limit Has Been Reached.</span>` : '')}
      </div>
      <button class="priz-remove" data-remove="${i.id}">&times;</button>
    </div>
  `;
  }).join('');
  stockLimitNotice = null;

  $$('[data-qty-up]').forEach(b => b.onclick = () => setQty(b.dataset.qtyUp, (cart.find(i => i.id === b.dataset.qtyUp).qty) + 1));
  $$('[data-qty-down]').forEach(b => b.onclick = () => setQty(b.dataset.qtyDown, (cart.find(i => i.id === b.dataset.qtyDown).qty) - 1));
  $$('[data-remove]').forEach(b => b.onclick = () => removeFromCart(b.dataset.remove));

  foot.innerHTML = `
    <div class="priz-total-row"><span>Subtotal</span><strong>₹${cartTotal().toLocaleString('en-IN')}</strong></div>
    <p class="priz-hint">Prepaid orders only — we don't offer Cash on Delivery. You'll enter delivery details and pay on the next page.</p>
    <a href="checkout.html" class="btn" style="width:100%; justify-content:center;">Proceed to Payment</a>
  `;
}

function renderWishlistDrawer() {
  const wrap = $('#wishlistItemsWrap');
  if (!wrap) return;
  const list = getWishlist();
  if (list.length === 0) { wrap.innerHTML = '<p class="priz-empty">Your wishlist is empty.</p>'; return; }
  wrap.innerHTML = list.map(i => `
    <div class="priz-line">
      <img src="${i.image}" alt="${i.name}">
      <div class="priz-line-info">
        <span class="priz-line-name">${i.name}</span>
        <span class="priz-line-price">₹${i.price.toLocaleString('en-IN')}</span>
        <button class="quick-add-btn" data-wl-add="${i.id}">Move to Cart</button>
      </div>
      <button class="priz-remove" data-wl-remove="${i.id}">&times;</button>
    </div>
  `).join('');
  $$('[data-wl-add]').forEach(b => b.onclick = () => {
    const item = list.find(i => i.id === b.dataset.wlAdd);
    addToCart(item);
    toggleWishlistItem(item);
  });
  $$('[data-wl-remove]').forEach(b => b.onclick = () => toggleWishlistItem(list.find(i => i.id === b.dataset.wlRemove)));
}

/* ---------------- ACCOUNT (login / signup / order history) ---------------- */
let authMode = 'login';

function renderAccountPanel() {
  const body = $('#accountPanelBody');
  if (!body) return;
  const auth = window.PrizmoraaAuth;
  const title = $('#accountPanelTitle');
  if (auth && auth.isLoggedIn()) {
    if (title) title.textContent = 'My Account';
    renderLoggedInAccount(body, auth.getUser());
  } else {
    if (title) title.textContent = authMode === 'signup' ? 'Create Account' : authMode === 'forgot' ? 'Reset Password' : 'Log In';
    renderAuthForms(body);
  }
}

// Firebase requires E.164 format (a leading "+" and country code) and
// rejects anything else with a raw "invalid-phone-number" error — but
// customers naturally type a bare 10-digit Indian mobile number. Default
// a number with no "+" to +91 (stripping a leading 0, if any) rather than
// making everyone remember to type the country code themselves.
function normalizePhoneNumber(raw) {
  const digitsAndPlus = raw.replace(/[^\d+]/g, '');
  if (digitsAndPlus.startsWith('+')) return digitsAndPlus;
  return '+91' + digitsAndPlus.replace(/^0+/, '');
}

// Phone OTP requires Firebase's paid Blaze plan to actually send SMS —
// the code stays intact and working (see below) for whenever that's
// turned back on, it's just not rendered or wired up for now. Flip this
// back to true to bring the "Continue with Phone OTP" UI back.
const PHONE_OTP_ENABLED = false;

/**
 * Google popup + phone/OTP + email/OTP sign-in, appended after an
 * email/password auth form. Shared by both the account panel and the
 * checkout gate so there's one implementation of this wiring.
 */
let socialAuthCounter = 0;
function renderSocialAuthExtras(container, onAuthed, showError) {
  socialAuthCounter += 1;
  const uid = `sa${socialAuthCounter}`;
  const wrap = document.createElement('div');
  wrap.className = 'priz-social-auth';
  wrap.innerHTML = `
    <div class="priz-auth-divider"><span>or</span></div>
    <button type="button" class="priz-google-btn" id="${uid}-google">
      <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.8 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3c-7.7 0-14.3 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 45c5.4 0 10.3-1.8 14.1-5l-6.5-5.5C29.6 36 26.9 37 24 37c-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.6 40.5 16.3 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.6 4.7-4.9 6.1l6.5 5.5C39.9 37.4 43 31.5 43 24c0-1.4-.1-2.7-.4-3.5z"/></svg>
      Continue with Google
    </button>
    ${PHONE_OTP_ENABLED ? `
    <div class="priz-phone-auth">
      <div class="priz-phone-step" id="${uid}-step-number">
        <input type="tel" class="priz-input" placeholder="Phone number (e.g. 98765 43210)" id="${uid}-phone">
        <button type="button" class="btn-ghost priz-phone-btn" id="${uid}-send-otp">Continue with Phone OTP</button>
      </div>
      <div class="priz-phone-step" id="${uid}-step-otp" style="display:none;">
        <input type="text" inputmode="numeric" class="priz-input" placeholder="Enter the OTP" id="${uid}-otp">
        <button type="button" class="btn-ghost priz-phone-btn" id="${uid}-verify-otp">Verify OTP</button>
      </div>
    </div>
    <div id="${uid}-recaptcha"></div>
    ` : ''}
    <div class="priz-phone-auth">
      <div class="priz-phone-step" id="${uid}-estep-email">
        <input type="email" class="priz-input" placeholder="Email for a one-time code" id="${uid}-eemail">
        <button type="button" class="btn-ghost priz-phone-btn" id="${uid}-esend-otp">Continue with Email OTP</button>
      </div>
      <div class="priz-phone-step" id="${uid}-estep-otp" style="display:none;">
        <input type="text" inputmode="numeric" class="priz-input" placeholder="Enter the code" id="${uid}-ecode">
        <button type="button" class="btn-ghost priz-phone-btn" id="${uid}-everify-otp">Verify Code</button>
      </div>
    </div>
  `;
  container.appendChild(wrap);

  if (!firebaseConfigured) {
    wrap.querySelector(`#${uid}-google`).style.display = 'none';
  }

  const googleBtn = wrap.querySelector(`#${uid}-google`);
  if (firebaseConfigured) {
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      try {
        const idToken = await signInWithGoogle();
        await window.PrizmoraaAuth.loginWithIdToken(idToken);
        renderBadges();
        onAuthed();
      } catch (err) {
        showError(err.message || 'Google sign-in failed. Please try again.');
        googleBtn.disabled = false;
      }
    });
  }

  if (PHONE_OTP_ENABLED) {
    let confirmationResult = null;
    let recaptchaVerifier = null;

    const sendBtn = wrap.querySelector(`#${uid}-send-otp`);
    sendBtn.addEventListener('click', async () => {
      const raw = wrap.querySelector(`#${uid}-phone`).value.trim();
      if (!raw) { showError('Please enter your phone number.'); return; }
      const phone = normalizePhoneNumber(raw);
      if (!/^\+\d{8,15}$/.test(phone)) {
        showError('Please enter a valid phone number (10 digits, or include a country code like +1 for non-Indian numbers).');
        return;
      }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending OTP...';
      try {
        if (!recaptchaVerifier) recaptchaVerifier = setupRecaptcha(`${uid}-recaptcha`);
        confirmationResult = await sendPhoneOtp(phone, recaptchaVerifier);
        wrap.querySelector(`#${uid}-step-number`).style.display = 'none';
        wrap.querySelector(`#${uid}-step-otp`).style.display = '';
      } catch (err) {
        showError(err.message || 'Could not send OTP. Please check the number and try again.');
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Continue with Phone OTP';
      }
    });

    const verifyBtn = wrap.querySelector(`#${uid}-verify-otp`);
    verifyBtn.addEventListener('click', async () => {
      const code = wrap.querySelector(`#${uid}-otp`).value.trim();
      if (!code) { showError('Please enter the OTP.'); return; }
      verifyBtn.disabled = true;
      try {
        const idToken = await confirmPhoneOtp(confirmationResult, code);
        await window.PrizmoraaAuth.loginWithIdToken(idToken);
        renderBadges();
        onAuthed();
      } catch (err) {
        showError(err.message || 'Incorrect OTP. Please try again.');
        verifyBtn.disabled = false;
      }
    });
  }

  let otpEmail = '';
  const eSendBtn = wrap.querySelector(`#${uid}-esend-otp`);
  eSendBtn.addEventListener('click', async () => {
    const email = wrap.querySelector(`#${uid}-eemail`).value.trim();
    if (!email) { showError('Please enter your email.'); return; }
    eSendBtn.disabled = true;
    eSendBtn.textContent = 'Sending code...';
    try {
      await window.PrizmoraaAuth.sendEmailOtp(email);
      otpEmail = email;
      wrap.querySelector(`#${uid}-estep-email`).style.display = 'none';
      wrap.querySelector(`#${uid}-estep-otp`).style.display = '';
    } catch (err) {
      showError(err.message || 'Could not send the code. Please try again.');
    } finally {
      eSendBtn.disabled = false;
      eSendBtn.textContent = 'Continue with Email OTP';
    }
  });

  const eVerifyBtn = wrap.querySelector(`#${uid}-everify-otp`);
  eVerifyBtn.addEventListener('click', async () => {
    const code = wrap.querySelector(`#${uid}-ecode`).value.trim();
    if (!code) { showError('Please enter the code.'); return; }
    eVerifyBtn.disabled = true;
    try {
      await window.PrizmoraaAuth.verifyEmailOtp(otpEmail, code);
      renderBadges();
      onAuthed();
    } catch (err) {
      showError(err.message || 'Incorrect code. Please try again.');
      eVerifyBtn.disabled = false;
    }
  });
}

/**
 * Standalone "enter your email, get a reset link" form — shared by both
 * the account panel and the checkout gate. Always shows the same generic
 * confirmation message regardless of whether the email is registered
 * (matches the server's anti-enumeration behavior).
 */
function renderForgotPasswordForm(container, onBack) {
  container.innerHTML = `
    <h2 class="checkout-subhead" style="margin-bottom:6px;">Reset your password</h2>
    <p class="priz-hint">Enter your account email and we'll send you a link to set a new password.</p>
    <p class="priz-auth-error" id="forgotError" style="display:none;"></p>
    <p class="priz-auth-success" id="forgotSuccess" style="display:none;"></p>
    <form id="forgotForm">
      <input required type="email" id="forgotEmail" class="priz-input" placeholder="Email" autocomplete="email">
      <button type="submit" class="btn" style="width:100%">Send Reset Link</button>
    </form>
    <button type="button" class="priz-forgot-link" id="backToLoginLink">Back to log in</button>
  `;

  $('#backToLoginLink', container).addEventListener('click', onBack);

  const errEl = $('#forgotError', container);
  const successEl = $('#forgotSuccess', container);
  const showError = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; successEl.style.display = 'none'; };

  const form = $('#forgotForm', container);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const message = await window.PrizmoraaAuth.forgotPassword($('#forgotEmail', container).value.trim());
      errEl.style.display = 'none';
      form.style.display = 'none';
      successEl.textContent = message;
      successEl.style.display = 'block';
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      btn.disabled = false;
    }
  });
}

function renderAuthForms(body) {
  if (authMode === 'forgot') {
    renderForgotPasswordForm(body, () => { authMode = 'login'; renderAccountPanel(); });
    return;
  }
  const isLogin = authMode === 'login';
  body.innerHTML = `
    <div class="priz-auth-tabs">
      <button type="button" class="priz-auth-tab ${isLogin ? 'active' : ''}" data-auth-tab="login">Log In</button>
      <button type="button" class="priz-auth-tab ${!isLogin ? 'active' : ''}" data-auth-tab="signup">Sign Up</button>
    </div>
    <p class="priz-auth-error" id="authError" style="display:none;"></p>
    ${isLogin ? `
      <form id="loginForm">
        <input required type="email" id="loginEmail" class="priz-input" placeholder="Email" autocomplete="email">
        <input required type="password" id="loginPassword" class="priz-input" placeholder="Password" autocomplete="current-password">
        <button type="submit" class="btn" style="width:100%">Log In</button>
      </form>
      <button type="button" class="priz-forgot-link" id="forgotPasswordLink">Forgot password?</button>
    ` : `
      <form id="signupForm">
        <input required type="text" id="signupName" class="priz-input" placeholder="Full name" autocomplete="name">
        <input required type="email" id="signupEmail" class="priz-input" placeholder="Email" autocomplete="email">
        <input type="tel" id="signupPhone" class="priz-input" placeholder="WhatsApp number" autocomplete="tel">
        <input required type="password" id="signupPassword" class="priz-input" placeholder="Password (min 6 characters)" autocomplete="new-password">
        <button type="submit" class="btn" style="width:100%">Create Account</button>
      </form>
    `}
    <p class="priz-hint">Signing in lets you track past orders and check out faster. Guest checkout is always available too.</p>
  `;

  $$('[data-auth-tab]', body).forEach(b => b.addEventListener('click', () => {
    authMode = b.dataset.authTab;
    renderAccountPanel();
  }));

  if (isLogin) {
    $('#forgotPasswordLink', body).addEventListener('click', () => {
      authMode = 'forgot';
      renderAccountPanel();
    });
  }

  const errEl = $('#authError');
  const showError = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

  const form = isLogin ? $('#loginForm') : $('#signupForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      if (isLogin) {
        await window.PrizmoraaAuth.login({
          email: $('#loginEmail').value.trim(),
          password: $('#loginPassword').value,
        });
      } else {
        await window.PrizmoraaAuth.signup({
          name: $('#signupName').value.trim(),
          email: $('#signupEmail').value.trim(),
          phone: $('#signupPhone').value.trim(),
          password: $('#signupPassword').value,
        });
      }
      renderAccountPanel();
      renderBadges();
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      btn.disabled = false;
    }
  });

  renderSocialAuthExtras(body, () => { renderAccountPanel(); renderBadges(); }, showError);
}

/**
 * Standalone login/signup form for gating checkout — separate from the
 * account panel's renderAuthForms() because it renders into an arbitrary
 * page container (not the slide-out panel) and calls back on success
 * instead of re-rendering the panel.
 */
function renderAuthGate(container, onAuthed) {
  let mode = 'login';
  function render() {
    if (mode === 'forgot') {
      renderForgotPasswordForm(container, () => { mode = 'login'; render(); });
      return;
    }
    const isLogin = mode === 'login';
    container.innerHTML = `
      <div class="checkout-auth-gate">
        <h2 class="checkout-subhead">Sign in to continue</h2>
        <p class="priz-hint">Please log in or create a free account to place your order — this keeps your order history and makes checkout faster next time.</p>
        <div class="priz-auth-tabs">
          <button type="button" class="priz-auth-tab ${isLogin ? 'active' : ''}" data-gate-tab="login">Log In</button>
          <button type="button" class="priz-auth-tab ${!isLogin ? 'active' : ''}" data-gate-tab="signup">Sign Up</button>
        </div>
        <p class="priz-auth-error" id="gateAuthError" style="display:none;"></p>
        ${isLogin ? `
          <form id="gateLoginForm">
            <input required type="email" id="gateLoginEmail" class="priz-input" placeholder="Email" autocomplete="email">
            <input required type="password" id="gateLoginPassword" class="priz-input" placeholder="Password" autocomplete="current-password">
            <button type="submit" class="btn" style="width:100%">Log In</button>
          </form>
          <button type="button" class="priz-forgot-link" id="gateForgotPasswordLink">Forgot password?</button>
        ` : `
          <form id="gateSignupForm">
            <input required type="text" id="gateSignupName" class="priz-input" placeholder="Full name" autocomplete="name">
            <input required type="email" id="gateSignupEmail" class="priz-input" placeholder="Email" autocomplete="email">
            <input type="tel" id="gateSignupPhone" class="priz-input" placeholder="WhatsApp number" autocomplete="tel">
            <input required type="password" id="gateSignupPassword" class="priz-input" placeholder="Password (min 6 characters)" autocomplete="new-password">
            <button type="submit" class="btn" style="width:100%">Create Account</button>
          </form>
        `}
      </div>
    `;

    $$('[data-gate-tab]', container).forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.gateTab;
      render();
    }));

    if (isLogin) {
      $('#gateForgotPasswordLink', container).addEventListener('click', () => {
        mode = 'forgot';
        render();
      });
    }

    const errEl = $('#gateAuthError', container);
    const showError = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };
    const form = isLogin ? $('#gateLoginForm', container) : $('#gateSignupForm', container);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        if (isLogin) {
          await window.PrizmoraaAuth.login({
            email: $('#gateLoginEmail', container).value.trim(),
            password: $('#gateLoginPassword', container).value,
          });
        } else {
          await window.PrizmoraaAuth.signup({
            name: $('#gateSignupName', container).value.trim(),
            email: $('#gateSignupEmail', container).value.trim(),
            phone: $('#gateSignupPhone', container).value.trim(),
            password: $('#gateSignupPassword', container).value,
          });
        }
        renderBadges();
        onAuthed();
      } catch (err) {
        showError(err.message || 'Something went wrong. Please try again.');
        btn.disabled = false;
      }
    });

    renderSocialAuthExtras(container, onAuthed, showError);
  }
  render();
}

function renderLoggedInAccount(body, user) {
  const p = getProfile();
  body.innerHTML = `
    <div class="priz-account-welcome">
      <strong>Hi, ${user.name}</strong>
      <span>${user.email}</span>
    </div>
    <button type="button" class="priz-logout-btn" id="logoutBtn">Log Out</button>
    <h4 class="priz-panel-subhead">Delivery Details</h4>
    <input type="tel" id="profPhone" class="priz-input" placeholder="WhatsApp number" value="${p.phone || user.phone || ''}">
    <textarea id="profAddress" class="priz-input" placeholder="Delivery address">${p.address || ''}</textarea>
    <input type="text" id="profPincode" class="priz-input" placeholder="Pincode" value="${p.pincode || ''}">
    <button class="btn" id="saveProfileBtn" style="width:100%">Save Details</button>
    <h4 class="priz-panel-subhead">My Orders</h4>
    <div id="myOrdersWrap"><p class="priz-hint">Loading your orders...</p></div>
  `;

  $('#logoutBtn').addEventListener('click', () => {
    window.PrizmoraaAuth.logout();
    authMode = 'login';
    renderAccountPanel();
    renderBadges();
  });

  $('#saveProfileBtn').addEventListener('click', (e) => {
    saveProfile({
      name: user.name,
      email: user.email,
      phone: $('#profPhone').value.trim(),
      address: $('#profAddress').value.trim(),
      pincode: $('#profPincode').value.trim(),
    });
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });

  loadMyOrders();
}

async function loadMyOrders() {
  const wrap = $('#myOrdersWrap');
  if (!wrap) return;
  const orders = await window.PrizmoraaAuth.fetchMyOrders();
  if (!orders.length) { wrap.innerHTML = '<p class="priz-empty">No orders yet.</p>'; return; }
  wrap.innerHTML = orders.map(o => {
    const hasBreakdown = o.subtotal != null;
    const breakdownHtml = hasBreakdown ? `
      <div class="priz-order-breakdown">
        <span>Subtotal ₹${Number(o.subtotal).toLocaleString('en-IN')}</span>
        ${o.discountAmount > 0 ? `<span>· Discount −₹${Number(o.discountAmount).toLocaleString('en-IN')}</span>` : ''}
        ${o.shippingCharge > 0 ? `<span>· Shipping ₹${Number(o.shippingCharge).toLocaleString('en-IN')}</span>` : ''}
      </div>
    ` : '';
    return `
    <div class="priz-order-card">
      <div class="priz-order-head">
        <span>${new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <span class="priz-order-status">${o.status}</span>
      </div>
      <div class="priz-order-items">${o.items.map(i => `${i.name} × ${i.qty}`).join(', ')}</div>
      ${breakdownHtml}
      <div class="priz-order-total">₹${Number(o.total).toLocaleString('en-IN')}</div>
    </div>
  `;
  }).join('');
}

/* ---------------- SEARCH ---------------- */
async function onSearchInput(e) {
  const q = e.target.value.trim().toLowerCase();
  const results = $('#prizSearchResults');
  if (!q) { results.innerHTML = ''; return; }
  const { getProducts, getEffectivePrice } = window.PrizmoraaProducts;
  const all = await getProducts();
  const matches = all.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  results.innerHTML = matches.length
    ? matches.map(p => `<a class="priz-search-result" href="product.html?id=${p.id}">
        <img src="${p.image}" alt="${p.name}"><span>${p.name} — ₹${getEffectivePrice(p).toLocaleString('en-IN')}</span>
      </a>`).join('')
    : '<p class="priz-empty">No matches found.</p>';
}

/* ---------------- RAZORPAY CHECKOUT ---------------- */
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve; s.onerror = reject;
    document.body.appendChild(s);
  });
}

/**
 * Shared Razorpay checkout flow — used by both the quick-checkout cart
 * drawer and the dedicated /checkout.html page, so there's one code path
 * for "create order -> open Razorpay -> verify -> record -> notify".
 * Returns { success: boolean, paymentId?, dismissed? }.
 */
async function runCheckout({ name, email, phone, address, pincode }, { onStatus, onError } = {}) {
  const cart = getCart();
  if (cart.length === 0) {
    onError && onError('Your cart is empty.');
    return { success: false };
  }

  saveProfile({ name, email, phone, address, pincode });
  onStatus && onStatus('Preparing payment...');

  try {
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.map(i => ({ id: i.id, qty: i.qty })) }),
    });
    const order = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) {
      onError && onError(order.error || 'Something went wrong starting payment. Please try again.');
      return { success: false };
    }

    await loadRazorpayScript();

    return await new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'PRIZMORAA',
        description: 'Jewellery order',
        order_id: order.orderId,
        prefill: { name, email, contact: phone },
        theme: { color: '#1e2327' },
        handler: async function (response) {
          onStatus && onStatus('Verifying payment...');
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.verified) {
            const paymentId = response.razorpay_payment_id;
            const recorded = await recordOrder({ name, email, phone, address, pincode, razorpayResponse: response });
            if (!recorded) {
              onError && onError('Payment succeeded but the order could not be saved. Please contact us on WhatsApp with your payment ID.');
            }
            sendOrderToWhatsApp({
              name, phone, address, pincode, cart, paymentId,
              subtotal: order.subtotal, shippingCharge: order.shippingCharge,
              discountAmount: order.discountAmount, total: order.total,
            });
            clearCart();
            resolve({ success: true, paymentId });
          } else {
            onError && onError('Payment could not be verified. If money was deducted, please contact us on WhatsApp with your payment ID.');
            resolve({ success: false });
          }
        },
        modal: {
          ondismiss: function () { resolve({ success: false, dismissed: true }); }
        }
      });
      rzp.open();
    });
  } catch (err) {
    console.error(err);
    onError && onError('Something went wrong starting payment. Please try again.');
    return { success: false };
  }
}

async function recordOrder({ name, email, phone, address, pincode, razorpayResponse }) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = window.PrizmoraaAuth && window.PrizmoraaAuth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name, email, phone, address, pincode,
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to record order (payment already succeeded):', err);
    return false;
  }
}

// Shared by both the admin-facing (logistics) and customer-facing (order
// record) WhatsApp messages, so the two never drift out of sync on what
// figures they show.
function buildOrderSummaryLines({ cart, subtotal, shippingCharge, discountAmount, total }) {
  const lines = cart.map(i => `• ${i.name} x${i.qty} — ₹${(i.price * i.qty).toLocaleString('en-IN')}`).join('\n');
  const fallbackSubtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalsLines = [`Subtotal: ₹${Number(subtotal ?? fallbackSubtotal).toLocaleString('en-IN')}`];
  if (discountAmount > 0) totalsLines.push(`Discount: −₹${Number(discountAmount).toLocaleString('en-IN')}`);
  if (shippingCharge > 0) totalsLines.push(`Shipping: ₹${Number(shippingCharge).toLocaleString('en-IN')}`);
  totalsLines.push(`Total: ₹${Number(total ?? fallbackSubtotal).toLocaleString('en-IN')}`);
  return { lines, totalsText: totalsLines.join('\n') };
}

function sendOrderToWhatsApp({ name, phone, address, pincode, cart, paymentId, subtotal, shippingCharge, discountAmount, total }) {
  const { lines, totalsText } = buildOrderSummaryLines({ cart, subtotal, shippingCharge, discountAmount, total });
  const text = encodeURIComponent(
`New PAID order — PRIZMORAA

${lines}

${totalsText}
Payment ID: ${paymentId}

Customer: ${name}
Phone: ${phone}
Address: ${address}, ${pincode}`
  );
  window.open(`${WHATSAPP_LINK}?text=${text}`, '_blank');
}

/* ---------------- NAV WIRING ---------------- */
function wireNavIcons() {
  $$('#cartToggleBtn').forEach(b => b.addEventListener('click', () => openPanel('cart')));
  $$('#wishlistToggleBtn').forEach(b => b.addEventListener('click', () => openPanel('wishlist')));
  $$('#searchToggleBtn').forEach(b => b.addEventListener('click', () => openPanel('search')));
  $$('#accountToggleBtn').forEach(b => b.addEventListener('click', () => openPanel('account')));

  $$('.wishlist-btn[data-wishlist-id]').forEach(b => {
    if (isWishlisted(b.dataset.id || b.dataset.wishlistId)) b.classList.add('active');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectShell();
  wireNavIcons();
  renderBadges();
});

window.PrizmoraaCart = {
  addToCart, addFromBtn, wishlistFromBtn, toggleWishlistItem, openPanel,
  getCart, cartCount, cartTotal, removeFromCart, setQty, clearCart,
  getProfile, runCheckout, renderAuthGate,
};