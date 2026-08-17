// js/cart.js — cart, wishlist, search, account, checkout (Razorpay + WhatsApp)

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

function addToCart(item, qty = 1) {
  const cart = getCart();
  const existing = cart.find(i => i.id === item.id);
  if (existing) existing.qty += qty;
  else cart.push({ id: item.id, name: item.name, price: Number(item.price), image: item.image, qty });
  saveCart(cart);
  openPanel('cart');
}
function removeFromCart(id) { saveCart(getCart().filter(i => i.id !== id)); }
function setQty(id, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;
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
  addToCart({ id: btn.dataset.id, name: btn.dataset.name, price: btn.dataset.price, image: btn.dataset.image });
}
function wishlistFromBtn(btn) {
  toggleWishlistItem({ id: btn.dataset.id, name: btn.dataset.name, price: btn.dataset.price, image: btn.dataset.image });
}

/* ---------------- PROFILE (delivery details, saved on device) ---------------- */
function getProfile() { return readJSON(PROFILE_KEY, { name: '', email: '', phone: '', address: '', pincode: '' }); }
function saveProfile(p) { writeJSON(PROFILE_KEY, p); }

/* ---------------- BADGES ---------------- */
function renderBadges() {
  $$('#cartCount').forEach(el => el.textContent = cartCount());
  $$('#wishlistCount').forEach(el => el.textContent = getWishlist().length);
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
  wrap.innerHTML = cart.map(i => `
    <div class="priz-line">
      <img src="${i.image}" alt="${i.name}">
      <div class="priz-line-info">
        <span class="priz-line-name">${i.name}</span>
        <span class="priz-line-price">₹${i.price.toLocaleString('en-IN')}</span>
        <div class="priz-qty">
          <button data-qty-down="${i.id}">−</button>
          <span>${i.qty}</span>
          <button data-qty-up="${i.id}">+</button>
        </div>
      </div>
      <button class="priz-remove" data-remove="${i.id}">&times;</button>
    </div>
  `).join('');

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
    if (title) title.textContent = authMode === 'login' ? 'Log In' : 'Create Account';
    renderAuthForms(body);
  }
}

function renderAuthForms(body) {
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
  wrap.innerHTML = orders.map(o => `
    <div class="priz-order-card">
      <div class="priz-order-head">
        <span>${new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <span class="priz-order-status">${o.status}</span>
      </div>
      <div class="priz-order-items">${o.items.map(i => `${i.name} × ${i.qty}`).join(', ')}</div>
      <div class="priz-order-total">₹${Number(o.total).toLocaleString('en-IN')}</div>
    </div>
  `).join('');
}

/* ---------------- SEARCH ---------------- */
async function onSearchInput(e) {
  const q = e.target.value.trim().toLowerCase();
  const results = $('#prizSearchResults');
  if (!q) { results.innerHTML = ''; return; }
  const { getProducts } = window.PrizmoraaProducts;
  const all = await getProducts();
  const matches = all.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  results.innerHTML = matches.length
    ? matches.map(p => `<a class="priz-search-result" href="product.html?id=${p.id}">
        <img src="${p.image}" alt="${p.name}"><span>${p.name} — ₹${p.price.toLocaleString('en-IN')}</span>
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
    const amountPaise = Math.round(cartTotal() * 100);
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, receipt: `priz_${Date.now()}` }),
    });
    if (!orderRes.ok) throw new Error('order-failed');
    const order = await orderRes.json();

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
            await recordOrder({ name, email, phone, address, pincode, cart, paymentId });
            sendOrderToWhatsApp({ name, phone, address, pincode, cart, paymentId });
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

async function recordOrder({ name, email, phone, address, pincode, cart, paymentId }) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = window.PrizmoraaAuth && window.PrizmoraaAuth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total: cartTotal(),
        name, email, phone, address, pincode, paymentId,
      }),
    });
  } catch (err) {
    console.error('Failed to record order (payment already succeeded):', err);
  }
}

function sendOrderToWhatsApp({ name, phone, address, pincode, cart, paymentId }) {
  const lines = cart.map(i => `• ${i.name} x${i.qty} — ₹${(i.price * i.qty).toLocaleString('en-IN')}`).join('\n');
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const text = encodeURIComponent(
`New PAID order — PRIZMORAA

${lines}

Total: ₹${total.toLocaleString('en-IN')}
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
  getProfile, runCheckout,
};