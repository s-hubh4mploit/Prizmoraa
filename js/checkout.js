// js/checkout.js — controller for the dedicated checkout.html page.
// Reuses window.PrizmoraaCart.runCheckout() (js/cart.js) for the actual
// Razorpay create-order -> pay -> verify -> record-order flow, so there is
// exactly one implementation of that logic shared with the cart drawer.
//
// The subtotal/discount/shipping/total shown here are a client-side
// preview only, computed from the current cart and the site's public
// settings — the amount actually charged is computed independently by
// the server at /api/create-order, which is the authoritative figure.

const $ = (sel, root = document) => root.querySelector(sel);

let siteSettings = { shippingCharge: 0, discountPercent: 0 };

async function fetchSiteSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    siteSettings = await res.json();
  } catch (e) {
    // Fall back to no shipping/discount rather than blocking checkout.
  }
}

function computeTotals() {
  const subtotal = window.PrizmoraaCart.cartTotal();
  const discountAmount = Math.round(subtotal * (siteSettings.discountPercent / 100));
  const shippingCharge = siteSettings.shippingCharge || 0;
  const total = Math.max(0, subtotal - discountAmount + shippingCharge);
  return { subtotal, discountAmount, shippingCharge, total };
}

function renderTotals() {
  const { subtotal, discountAmount, shippingCharge, total } = computeTotals();
  const totalsEl = $('#checkoutSummaryTotals');
  totalsEl.innerHTML = `
    <div class="checkout-totals">
      <div class="checkout-total-line"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
      ${discountAmount > 0 ? `<div class="checkout-total-line discount"><span>Discount</span><span>−₹${discountAmount.toLocaleString('en-IN')}</span></div>` : ''}
      <div class="checkout-total-line"><span>Shipping</span><span>${shippingCharge > 0 ? '₹' + shippingCharge.toLocaleString('en-IN') : 'Free'}</span></div>
    </div>
    <div class="checkout-total-row">
      <span>Total</span>
      <strong id="checkoutTotal">₹${total.toLocaleString('en-IN')}</strong>
    </div>
  `;
  return total;
}

function renderSummary() {
  const cart = window.PrizmoraaCart.getCart();
  const wrap = $('#checkoutItemsWrap');
  const layout = $('#checkoutLayout');
  const payBtn = $('#checkoutPagePayBtn');

  if (cart.length === 0) {
    layout.innerHTML = `
      <div class="checkout-empty">
        <p>Your bag is empty.</p>
        <a href="collections.html" class="btn">Browse Collections</a>
      </div>
    `;
    return false;
  }

  wrap.innerHTML = cart.map(i => `
    <div class="checkout-line">
      <img src="${i.image}" alt="${i.name}">
      <div class="checkout-line-info">
        <span class="checkout-line-name">${i.name}</span>
        <span class="checkout-line-qty">Qty: ${i.qty}</span>
      </div>
      <span class="checkout-line-price">₹${(i.price * i.qty).toLocaleString('en-IN')}</span>
    </div>
  `).join('');
  const total = renderTotals();
  if (payBtn) payBtn.textContent = `Pay ₹${total.toLocaleString('en-IN')} & Place Order`;
  return true;
}

function prefillForm() {
  const p = window.PrizmoraaCart.getProfile();
  const authUser = window.PrizmoraaAuth && window.PrizmoraaAuth.getUser();
  $('#cpName').value = p.name || (authUser && authUser.name) || '';
  $('#cpEmail').value = p.email || (authUser && authUser.email) || '';
  $('#cpPhone').value = p.phone || (authUser && authUser.phone) || '';
  $('#cpAddress').value = p.address || '';
  $('#cpPincode').value = p.pincode || '';
}

function showSuccess(paymentId, orderDetails) {
  $('#checkoutLayout').style.display = 'none';
  const success = $('#checkoutSuccess');
  success.style.display = 'block';
  $('#checkoutSuccessDetail').textContent = paymentId
    ? `Payment ID: ${paymentId}. A confirmation email is on its way — we'll also reach out on WhatsApp with delivery updates.`
    : `We'll reach out on WhatsApp shortly with delivery updates.`;

  const shareBtn = $('#checkoutWhatsappShare');
  if (shareBtn && orderDetails) {
    shareBtn.href = window.PrizmoraaCart.buildCustomerOrderShareUrl(orderDetails);
    shareBtn.style.display = '';
  }
}

function initCheckoutForm() {
  prefillForm();

  const form = $('#checkoutPageForm');
  const payBtn = $('#checkoutPagePayBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const details = {
      name: $('#cpName').value.trim(),
      email: $('#cpEmail').value.trim(),
      phone: $('#cpPhone').value.trim(),
      address: $('#cpAddress').value.trim(),
      pincode: $('#cpPincode').value.trim(),
    };
    payBtn.disabled = true;
    const result = await window.PrizmoraaCart.runCheckout(details, {
      onStatus: (msg) => { payBtn.textContent = msg; },
      onError: (msg) => { alert(msg); },
    });
    payBtn.disabled = false;
    if (result.success) {
      showSuccess(result.paymentId, result.orderDetails);
    } else {
      const { total } = computeTotals();
      payBtn.textContent = `Pay ₹${total.toLocaleString('en-IN')} & Place Order`;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchSiteSettings();
  const hasItems = renderSummary();
  if (!hasItems) return;

  if (window.PrizmoraaAuth && window.PrizmoraaAuth.isLoggedIn()) {
    initCheckoutForm();
  } else {
    const formCol = $('.checkout-form-col');
    window.PrizmoraaCart.renderAuthGate(formCol, initCheckoutForm);
  }
});
