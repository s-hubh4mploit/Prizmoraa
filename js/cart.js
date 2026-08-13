// js/cart.js — cart, wishlist, search, account, checkout (Razorpay + WhatsApp)

const CART_KEY = 'prizmoraa_cart_v1';
const WISHLIST_KEY = 'prizmoraa_wishlist_v1';
const PROFILE_KEY = 'prizmoraa_profile_v1';

// TODO: replace with your WhatsApp Business number — country code + number, digits only, no + or spaces
const WHATSAPP_NUMBER = '91XXXXXXXXXX';

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

/* ---------------- PROFILE (lightweight "account") ---------------- */
function getProfile() { return readJSON(PROFILE_KEY, { name: '', phone: '', address: '', pincode: '' }); }
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
        <h3>Your Bag</h3>
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
        <h3>My Details</h3>
        <button class="priz-close" data-close>&times;</button>
      </div>
      <div class="priz-panel-body">
        <p class="priz-hint">Saved on this device only — used to pre-fill checkout faster.</p>
        <input type="text" id="profName" class="priz-input" placeholder="Full name">
        <input type="tel" id="profPhone" class="priz-input" placeholder="WhatsApp number">
        <textarea id="profAddress" class="priz-input" placeholder="Delivery address"></textarea>
        <input type="text" id="profPincode" class="priz-input" placeholder="Pincode">
        <button class="btn" id="saveProfileBtn" style="width:100%">Save</button>
      </div>
    </aside>
  `;
  document.body.appendChild(div);

  $('#prizPanelOverlay').addEventListener('click', closeAllPanels);
  $$('[data-close]').forEach(b => b.addEventListener('click', closeAllPanels));

  $('#prizSearchInput').addEventListener('input', onSearchInput);

  $('#saveProfileBtn').addEventListener('click', () => {
    saveProfile({
      name: $('#profName').value.trim(),
      phone: $('#profPhone').value.trim(),
      address: $('#profAddress').value.trim(),
      pincode: $('#profPincode').value.trim(),
    });
    closeAllPanels();
  });

  const p = getProfile();
  $('#profName').value = p.name; $('#profPhone').value = p.phone;
  $('#profAddress').value = p.address; $('#profPincode').value = p.pincode;
}

function openPanel(name) {
  closeAllPanels();
  const map = { cart: 'prizCartPanel', wishlist: 'prizWishlistPanel', search: 'prizSearchPanel', account: 'prizAccountPanel' };
  $('#prizPanelOverlay').classList.add('open');
  $(`#${map[name]}`).classList.add('open');
  document.body.classList.add('priz-lock');
  if (name === 'cart') renderCartDrawer();
  if (name === 'wishlist') renderWishlistDrawer();
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
    wrap.innerHTML = '<p class="priz-empty">Your bag is empty.</p>';
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

  const p = getProfile();
  foot.innerHTML = `
    <div class="priz-total-row"><span>Subtotal</span><strong>₹${cartTotal().toLocaleString('en-IN')}</strong></div>
    <p class="priz-hint">Prepaid orders only — we don't offer Cash on Delivery. Complete payment to confirm.</p>
    <form id="checkoutForm" class="priz-checkout-form">
      <input required id="ckName" class="priz-input" placeholder="Full name" value="${p.name || ''}">
      <input required id="ckPhone" class="priz-input" type="tel" placeholder="WhatsApp number" value="${p.phone || ''}">
      <textarea required id="ckAddress" class="priz-input" placeholder="Delivery address">${p.address || ''}</textarea>
      <input required id="ckPincode" class="priz-input" placeholder="Pincode" value="${p.pincode || ''}">
      <button type="submit" class="btn" style="width:100%" id="payBtn">Pay ₹${cartTotal().toLocaleString('en-IN')} & Place Order</button>
    </form>
  `;
  $('#checkoutForm').addEventListener('submit', handleCheckoutSubmit);
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
        <button class="quick-add-btn" data-wl-add="${i.id}">Move to Bag</button>
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

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const payBtn = $('#payBtn');
  const name = $('#ckName').value.trim();
  const phone = $('#ckPhone').value.trim();
  const address = $('#ckAddress').value.trim();
  const pincode = $('#ckPincode').value.trim();
  const cart = getCart();
  if (cart.length === 0) return;

  saveProfile({ name, phone, address, pincode });

  payBtn.disabled = true; payBtn.textContent = 'Preparing payment...';
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

    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'PRIZMORAA',
      description: 'Jewellery order',
      order_id: order.orderId,
      prefill: { name, contact: phone },
      theme: { color: '#1e2327' },
      handler: async function (response) {
        payBtn.textContent = 'Verifying payment...';
        const verifyRes = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
        const verifyData = await verifyRes.json();
        if (verifyData.verified) {
          sendOrderToWhatsApp({ name, phone, address, pincode, cart, paymentId: response.razorpay_payment_id });
          clearCart();
          closeAllPanels();
        } else {
          alert('Payment could not be verified. If money was deducted, please contact us on WhatsApp with your payment ID.');
        }
        payBtn.disabled = false; payBtn.textContent = `Pay ₹${cartTotal().toLocaleString('en-IN')} & Place Order`;
      },
      modal: {
        ondismiss: function () {
          payBtn.disabled = false; payBtn.textContent = `Pay ₹${cartTotal().toLocaleString('en-IN')} & Place Order`;
        }
      }
    });
    rzp.open();
  } catch (err) {
    console.error(err);
    alert('Something went wrong starting payment. Please try again.');
    payBtn.disabled = false; payBtn.textContent = `Pay ₹${cartTotal().toLocaleString('en-IN')} & Place Order`;
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
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
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

window.PrizmoraaCart = { addToCart, addFromBtn, wishlistFromBtn, toggleWishlistItem, openPanel, getCart, cartCount };