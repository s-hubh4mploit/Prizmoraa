// js/checkout.js — controller for the dedicated checkout.html page.
// Reuses window.PrizmoraaCart.runCheckout() (js/cart.js) for the actual
// Razorpay create-order -> pay -> verify -> record-order flow, so there is
// exactly one implementation of that logic shared with the cart drawer.

const $ = (sel, root = document) => root.querySelector(sel);

function renderSummary() {
  const cart = window.PrizmoraaCart.getCart();
  const wrap = $('#checkoutItemsWrap');
  const totalEl = $('#checkoutTotal');
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
  totalEl.textContent = `₹${window.PrizmoraaCart.cartTotal().toLocaleString('en-IN')}`;
  if (payBtn) payBtn.textContent = `Pay ₹${window.PrizmoraaCart.cartTotal().toLocaleString('en-IN')} & Place Order`;
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

function showSuccess(paymentId) {
  $('#checkoutLayout').style.display = 'none';
  const success = $('#checkoutSuccess');
  success.style.display = 'block';
  $('#checkoutSuccessDetail').textContent = paymentId
    ? `Payment ID: ${paymentId}. A confirmation email is on its way — we'll also reach out on WhatsApp with delivery updates.`
    : `We'll reach out on WhatsApp shortly with delivery updates.`;
}

document.addEventListener('DOMContentLoaded', () => {
  const hasItems = renderSummary();
  if (!hasItems) return;
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
      showSuccess(result.paymentId);
    } else {
      payBtn.textContent = `Pay ₹${window.PrizmoraaCart.cartTotal().toLocaleString('en-IN')} & Place Order`;
    }
  });
});
