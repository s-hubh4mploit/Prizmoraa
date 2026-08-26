// Admin Dashboard Logic - Universal file:// and http:// compatibility

const SESSION_KEY = 'prizmoraa_admin_token';
// The admin API key is no longer shipped in this file. It's issued by
// /api/admin-login only after the server verifies the username/password
// (which also never leave the server), and kept only in memory for this
// page session — never persisted, so a reload always requires logging in
// again, same as before.
let ADMIN_API_KEY = null;

// Basic XSS Sanitizer
function sanitizeInput(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getProductManager() {
  return window.PrizmoraaProducts || {
    getProducts: async () => [],
    saveProduct: async () => {},
    deleteProduct: async () => {},
    resetInventoryToDefault: async () => []
  };
}

// A save/delete/reset call that the server rejected (bad or missing admin key)
// throws rather than silently falling back to local-only storage. Surface it
// and force a fresh login instead of letting the admin believe it saved.
function handleAdminAuthError(err) {
  if (err && err.authError) {
    alert('Your admin session is invalid or has expired. Please log in again.');
    ADMIN_API_KEY = null;
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
    return;
  }
  console.error(err);
  alert('Something went wrong saving that change. Please try again.');
}

// Always land on the login screen when the admin URL is opened or reloaded —
// no session is persisted across navigations, so a stale/leftover token
// can never skip straight to the dashboard.
async function checkAuth() {
  sessionStorage.removeItem(SESSION_KEY);
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'flex';
}

// --- Security & Login ---
// The username/password are verified server-side in /api/admin-login (see
// that file to change them); brute-force lockout is also enforced there,
// since a client-side-only counter is trivially bypassed by reloading.
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const rawUser = document.getElementById('adminUsername').value || '';
    const rawPass = document.getElementById('adminPassword').value || '';

    if (submitBtn) submitBtn.disabled = true;
    if (loginError) loginError.style.display = 'none';

    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: rawUser.trim(), password: rawPass.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.apiKey) {
        ADMIN_API_KEY = data.apiKey;
        sessionStorage.setItem(SESSION_KEY, 'secure-token-abc-123');
        if (loginOverlay) loginOverlay.style.display = 'none';
        await initDashboard();
        return;
      }

      if (loginError) {
        if (res.status === 429) {
          const seconds = Math.max(1, Math.ceil((data.retryAfterMs || 0) / 1000));
          loginError.textContent = `Too many attempts. Try again in ${seconds}s.`;
        } else {
          loginError.textContent = data.error || 'Invalid username or password.';
        }
        loginError.style.display = 'block';
      }
    } catch (err) {
      if (loginError) {
        loginError.textContent = 'Could not reach the server. Please try again.';
        loginError.style.display = 'block';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    ADMIN_API_KEY = null;
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  });
}

checkAuth();

// --- Dashboard Logic ---
let inventory = [];
let stockNotificationCount = 0;

async function initDashboard() {
  const pm = getProductManager();
  inventory = await pm.getProducts();
  await loadStockNotificationRequests();
  renderTable();
  updateStats();
}

async function loadStockNotificationRequests() {
  const dashboardTbody = document.getElementById('restockRequestsBody');
  const fullTbody = document.getElementById('notifyStockTableBody');
  const historyTbody = document.getElementById('notifyHistoryTableBody');
  const mostWantedTbody = document.getElementById('mostWantedTableBody');
  const statAlert = document.getElementById('statRestockAlerts');
  const countBadge = document.getElementById('restockRequestCount');
  const totalCountBadge = document.getElementById('notifyStockTotalCount');
  const historyCountBadge = document.getElementById('notifyHistoryTotalCount');
  const mostWantedCountBadge = document.getElementById('mostWantedCount');
  const loaders = [dashboardTbody, fullTbody, historyTbody, mostWantedTbody].filter(Boolean);

  loaders.forEach(tbody => {
    tbody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;
  });

  try {
    const res = await fetch('/api/products?includeNotifications=1', { headers: { 'x-admin-key': ADMIN_API_KEY } });
    if (!res.ok) {
      throw new Error('Could not load restock requests');
    }

    const data = await res.json();
    const notifications = Array.isArray(data.stockNotifications) ? data.stockNotifications : [];
    const history = Array.isArray(data.stockNotificationHistory) ? data.stockNotificationHistory : [];
    stockNotificationCount = notifications.length;
    const productMap = new Map((Array.isArray(data.inventory) ? data.inventory : inventory).map(item => [item.id, item]));

    if (statAlert) statAlert.textContent = notifications.length;
    if (countBadge) countBadge.textContent = notifications.length;
    if (totalCountBadge) totalCountBadge.textContent = notifications.length;
    if (historyCountBadge) historyCountBadge.textContent = history.length;

    const describeEntry = (entry, dateField) => {
      const product = productMap.get(entry.product_id) || null;
      const productName = product ? product.name : (entry.product_name || 'Unknown piece');
      const productImage = product && (product.images && product.images.length ? product.images[0] : product.image) ? (product.images && product.images.length ? product.images[0] : product.image) : 'images/hero.jpg';
      const category = product ? (product.category || '—') : '—';
      const dateValue = entry[dateField] ? new Date(entry[dateField]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      return {
        customer: sanitizeInput(entry.email || '—'),
        productName,
        productImage,
        category: sanitizeInput(category),
        dateLabel: sanitizeInput(dateValue),
        nameLabel: sanitizeInput(productName),
        productId: entry.product_id || '',
      };
    };

    const renderRows = notifications.map((entry) => describeEntry(entry, 'created_at'));
    const historyRows = history.map((entry) => describeEntry(entry, 'notified_at'));

    const dashboardHtml = renderRows.length ? renderRows.map((entry) => `
      <tr>
        <td><img class="restock-piece-image" src="${encodeURI(entry.productImage)}" alt="${entry.nameLabel}"></td>
        <td><a class="restock-product-link" href="product.html?id=${encodeURIComponent(entry.productId)}" target="_blank" rel="noopener">${entry.nameLabel}</a></td>
        <td>${entry.category}</td>
        <td>${entry.customer}</td>
        <td>${entry.dateLabel}</td>
      </tr>
    `).join('') : '<tr><td colspan="5">No restock requests yet.</td></tr>';

    const notifyHtml = renderRows.length ? renderRows.map((entry) => `
      <tr>
        <td><strong>${entry.customer}</strong></td>
        <td><a class="restock-product-link" href="product.html?id=${encodeURIComponent(entry.productId)}" target="_blank" rel="noopener">${entry.nameLabel}</a></td>
        <td><img class="restock-piece-image" src="${encodeURI(entry.productImage)}" alt="${entry.nameLabel}"></td>
        <td>${entry.category}</td>
        <td>${entry.dateLabel}</td>
      </tr>
    `).join('') : '<tr><td colspan="5">No notify stock requests yet.</td></tr>';

    const historyHtml = historyRows.length ? historyRows.map((entry) => `
      <tr>
        <td><strong>${entry.customer}</strong></td>
        <td><a class="restock-product-link" href="product.html?id=${encodeURIComponent(entry.productId)}" target="_blank" rel="noopener">${entry.nameLabel}</a></td>
        <td>${entry.category}</td>
        <td>${entry.dateLabel}</td>
      </tr>
    `).join('') : '<tr><td colspan="4">No customers notified yet.</td></tr>';

    // Aggregate pending + already-notified requests per product so the
    // admin can see which pieces customers actually want restocked most,
    // not just who's currently waiting.
    const demandMap = new Map();
    const bumpDemand = (productId, key) => {
      if (!productId) return;
      const entry = demandMap.get(productId) || { pending: 0, notified: 0 };
      entry[key] += 1;
      demandMap.set(productId, entry);
    };
    notifications.forEach((entry) => bumpDemand(entry.product_id, 'pending'));
    history.forEach((entry) => bumpDemand(entry.product_id, 'notified'));

    const demandRows = Array.from(demandMap.entries()).map(([productId, counts]) => {
      const product = productMap.get(productId) || null;
      const productName = product ? product.name : 'Unknown piece';
      const category = product ? (product.category || '—') : '—';
      return {
        productId,
        nameLabel: sanitizeInput(productName),
        category: sanitizeInput(category),
        pending: counts.pending,
        notified: counts.notified,
        total: counts.pending + counts.notified,
      };
    }).sort((a, b) => b.total - a.total);

    if (mostWantedCountBadge) mostWantedCountBadge.textContent = demandRows.length;

    const mostWantedHtml = demandRows.length ? demandRows.map((entry) => `
      <tr>
        <td><a class="restock-product-link" href="product.html?id=${encodeURIComponent(entry.productId)}" target="_blank" rel="noopener">${entry.nameLabel}</a></td>
        <td>${entry.category}</td>
        <td>${entry.pending}</td>
        <td>${entry.notified}</td>
        <td><strong>${entry.total}</strong></td>
      </tr>
    `).join('') : '<tr><td colspan="5">No demand data yet.</td></tr>';

    if (dashboardTbody) dashboardTbody.innerHTML = dashboardHtml;
    if (fullTbody) fullTbody.innerHTML = notifyHtml;
    if (historyTbody) historyTbody.innerHTML = historyHtml;
    if (mostWantedTbody) mostWantedTbody.innerHTML = mostWantedHtml;
  } catch (err) {
    stockNotificationCount = 0;
    if (statAlert) statAlert.textContent = '0';
    if (countBadge) countBadge.textContent = '0';
    if (totalCountBadge) totalCountBadge.textContent = '0';
    if (historyCountBadge) historyCountBadge.textContent = '0';
    if (mostWantedCountBadge) mostWantedCountBadge.textContent = '0';
    if (dashboardTbody) dashboardTbody.innerHTML = '<tr><td colspan="5">Restock requests are unavailable right now.</td></tr>';
    if (fullTbody) fullTbody.innerHTML = '<tr><td colspan="5">Notify stock requests are unavailable right now.</td></tr>';
    if (historyTbody) historyTbody.innerHTML = '<tr><td colspan="4">Notification history is unavailable right now.</td></tr>';
    if (mostWantedTbody) mostWantedTbody.innerHTML = '<tr><td colspan="5">Demand summary is unavailable right now.</td></tr>';
  }
}

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const currentViewTitle = document.getElementById('currentViewTitle');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    const viewId = item.getAttribute('data-view');
    views.forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById('view-' + viewId);
    if (targetView) targetView.classList.add('active');

    if (currentViewTitle) currentViewTitle.textContent = item.textContent.trim();

    if (viewId === 'notify-stock') loadStockNotificationRequests();
    if (viewId === 'orders') fetchOrders();
    if (viewId === 'customers') fetchCustomers();
    if (viewId === 'settings') loadSettings();
  });
});

// --- Settings (shipping charge + discount) ---
async function loadSettings() {
  const shippingInput = document.getElementById('settingsShipping');
  const discountInput = document.getElementById('settingsDiscount');
  if (!shippingInput || !discountInput) return;
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    shippingInput.value = data.shippingCharge ?? 0;
    discountInput.value = data.discountPercent ?? 0;
  } catch (err) {
    shippingInput.value = 0;
    discountInput.value = 0;
  }
}

const settingsForm = document.getElementById('settingsForm');
if (settingsForm) {
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = settingsForm.querySelector('button[type="submit"]');
    const savedMsg = document.getElementById('settingsSavedMsg');
    btn.disabled = true;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
        body: JSON.stringify({
          shippingCharge: parseFloat(document.getElementById('settingsShipping').value) || 0,
          discountPercent: parseFloat(document.getElementById('settingsDiscount').value) || 0,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      if (savedMsg) {
        savedMsg.style.display = 'block';
        setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
      }
    } catch (err) {
      alert('Could not save pricing settings. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });
}

// --- Customers ---
async function fetchCustomers() {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8">Loading customers...</td></tr>';
  updateDeleteSelectedState('customers');
  try {
    const res = await fetch('/api/auth/users', { headers: { 'x-admin-key': ADMIN_API_KEY } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      tbody.innerHTML = `<tr><td colspan="8">${sanitizeInput(data.error || 'Could not load customers.')}</td></tr>`;
      return;
    }
    const customers = await res.json();
    if (!Array.isArray(customers) || customers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">No customers have signed up yet.</td></tr>';
      return;
    }
    tbody.innerHTML = customers.map(c => {
      const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const addressText = [c.address, c.pincode].filter(Boolean).join(', ');
      return `
        <tr>
          <td><input type="checkbox" class="row-check customer-check" value="${sanitizeInput(c.id)}"></td>
          <td><strong>${sanitizeInput(c.name || '')}</strong></td>
          <td>${sanitizeInput(c.email || '—')}</td>
          <td>${sanitizeInput(c.phone || '—')}</td>
          <td>${sanitizeInput(addressText || '—')}</td>
          <td><span class="status-badge">${sanitizeInput(c.signInMethod)}</span></td>
          <td>${sanitizeInput(date)}</td>
          <td class="action-links"><button type="button" class="delete" onclick="deleteCustomer('${c.id}')">Delete</button></td>
        </tr>
      `;
    }).join('');
    wireRowCheckboxes('customer-check', 'customers');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8">Could not load customers.</td></tr>';
  }
}

window.deleteCustomer = async function(id) {
  if (!confirm('Delete this customer permanently? Their order history will stay, but they will no longer be able to sign in.')) return;
  try {
    const res = await fetch(`/api/auth/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_API_KEY },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete this customer.');
      return;
    }
    fetchCustomers();
  } catch (err) {
    alert('Could not reach the server. Please try again.');
  }
};

async function deleteSelectedCustomers() {
  const ids = Array.from(document.querySelectorAll('.customer-check:checked')).map(cb => cb.value);
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} customer(s) permanently? Their order history will stay, but they will no longer be able to sign in.`)) return;
  try {
    const res = await fetch('/api/auth/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete the selected customers.');
      return;
    }
    fetchCustomers();
  } catch (err) {
    alert('Could not reach the server. Please try again.');
  }
}

// --- Order item preview (zoomed image + which collection it's from) ---
window.showOrderItemPreview = function (imgEl) {
  const modal = document.getElementById('orderItemPreviewModal');
  if (!modal) return;
  const id = imgEl.dataset.itemId;
  const name = imgEl.dataset.itemName;
  const image = imgEl.dataset.itemImage;
  const price = Number(imgEl.dataset.itemPrice) || 0;

  // Category/sub-category aren't stored on the order line item itself —
  // look the product up in the inventory already loaded for this session.
  const product = inventory.find(p => p.id === id);

  document.getElementById('orderItemPreviewTitle').textContent = name;
  document.getElementById('orderItemPreviewImg').src = image;
  document.getElementById('orderItemPreviewImg').alt = name;
  document.getElementById('orderItemPreviewCollection').textContent = product
    ? [product.category, product.subcategory].filter(Boolean).map(sanitizeInput).join(' • ')
    : 'This item is no longer in the catalog.';
  document.getElementById('orderItemPreviewPrice').textContent = `₹${price.toLocaleString('en-IN')}`;
  modal.classList.add('active');
};

const closeOrderItemPreviewBtn = document.getElementById('closeOrderItemPreview');
if (closeOrderItemPreviewBtn) {
  closeOrderItemPreviewBtn.addEventListener('click', () => {
    document.getElementById('orderItemPreviewModal').classList.remove('active');
  });
}
const orderItemPreviewModal = document.getElementById('orderItemPreviewModal');
if (orderItemPreviewModal) {
  orderItemPreviewModal.addEventListener('click', (e) => {
    if (e.target === orderItemPreviewModal) orderItemPreviewModal.classList.remove('active');
  });
}

// --- Orders ---
async function fetchOrders() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="11">Loading orders...</td></tr>';
  updateDeleteSelectedState('orders');
  try {
    const res = await fetch('/api/orders', { headers: { 'x-admin-key': ADMIN_API_KEY } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      tbody.innerHTML = `<tr><td colspan="11">${sanitizeInput(data.error || 'Could not load orders.')}</td></tr>`;
      return;
    }
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11">No orders yet.</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map(o => {
      const itemsHtml = (o.items || []).map(i => {
        const imgSrc = i.image ? encodeURI(i.image) : 'images/hero.jpg';
        return `
          <div class="order-item-chip" title="${sanitizeInput(i.name)} × ${i.qty}">
            <img src="${imgSrc}" alt="${sanitizeInput(i.name)}"
              data-item-id="${sanitizeInput(i.id || '')}" data-item-name="${sanitizeInput(i.name)}"
              data-item-image="${imgSrc}" data-item-price="${Number(i.price) || 0}"
              onclick="showOrderItemPreview(this)">
            <span class="order-item-chip-qty">×${i.qty}</span>
            <span class="order-item-chip-name">${sanitizeInput(i.name)}</span>
          </div>
        `;
      }).join('');
      const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const addressText = [o.address, o.pincode].filter(Boolean).join(', ');
      return `
        <tr>
          <td><input type="checkbox" class="row-check order-check" value="${sanitizeInput(o.id)}"></td>
          <td>#${sanitizeInput(o.id)}</td>
          <td>${sanitizeInput(date)}</td>
          <td>${sanitizeInput(o.name)}</td>
          <td>${sanitizeInput(o.phone)}${o.email ? '<br>' + sanitizeInput(o.email) : ''}</td>
          <td>${sanitizeInput(addressText)}</td>
          <td><div class="order-items-cell">${itemsHtml}</div></td>
          <td>₹${sanitizeInput(Number(o.total).toLocaleString('en-IN'))}</td>
          <td>${sanitizeInput(o.paymentId || '')}</td>
          <td><span class="status-badge">${sanitizeInput(o.status || 'paid')}</span></td>
          <td class="action-links"><button type="button" class="delete" onclick="deleteOrder('${o.id}')">Delete</button></td>
        </tr>
      `;
    }).join('');
    wireRowCheckboxes('order-check', 'orders');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="11">Could not load orders.</td></tr>';
  }
}

window.deleteOrder = async function(id) {
  if (!confirm('Delete this order permanently? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_API_KEY },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete this order.');
      return;
    }
    fetchOrders();
  } catch (err) {
    alert('Could not reach the server. Please try again.');
  }
};

async function deleteSelectedOrders() {
  const ids = Array.from(document.querySelectorAll('.order-check:checked')).map(cb => cb.value);
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} order(s) permanently? This cannot be undone.`)) return;
  try {
    const res = await fetch('/api/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not delete the selected orders.');
      return;
    }
    fetchOrders();
  } catch (err) {
    alert('Could not reach the server. Please try again.');
  }
}

// --- Shared select-all / bulk-delete wiring for Orders & Customers ---
function updateDeleteSelectedState(kind) {
  const checks = document.querySelectorAll(`.${kind === 'orders' ? 'order-check' : 'customer-check'}:checked`);
  const btn = document.getElementById(kind === 'orders' ? 'btnDeleteSelectedOrders' : 'btnDeleteSelectedCustomers');
  const countEl = document.getElementById(kind === 'orders' ? 'ordersSelectedCount' : 'customersSelectedCount');
  if (countEl) countEl.textContent = checks.length;
  if (btn) btn.disabled = checks.length === 0;
}

function wireRowCheckboxes(rowClass, kind) {
  document.querySelectorAll(`.${rowClass}`).forEach(cb => {
    cb.addEventListener('change', () => updateDeleteSelectedState(kind));
  });
  const selectAll = document.getElementById(kind === 'orders' ? 'ordersSelectAll' : 'customersSelectAll');
  if (selectAll) selectAll.checked = false;
  updateDeleteSelectedState(kind);
}

const ordersSelectAll = document.getElementById('ordersSelectAll');
if (ordersSelectAll) {
  ordersSelectAll.addEventListener('change', () => {
    document.querySelectorAll('.order-check').forEach(cb => { cb.checked = ordersSelectAll.checked; });
    updateDeleteSelectedState('orders');
  });
}
const customersSelectAll = document.getElementById('customersSelectAll');
if (customersSelectAll) {
  customersSelectAll.addEventListener('change', () => {
    document.querySelectorAll('.customer-check').forEach(cb => { cb.checked = customersSelectAll.checked; });
    updateDeleteSelectedState('customers');
  });
}
const btnDeleteSelectedOrders = document.getElementById('btnDeleteSelectedOrders');
if (btnDeleteSelectedOrders) btnDeleteSelectedOrders.addEventListener('click', deleteSelectedOrders);
const btnDeleteSelectedCustomers = document.getElementById('btnDeleteSelectedCustomers');
if (btnDeleteSelectedCustomers) btnDeleteSelectedCustomers.addEventListener('click', deleteSelectedCustomers);

// Table Rendering
let currentCategoryFilter = 'all';
let currentSearchText = '';

function renderTable(filterText = currentSearchText) {
  currentSearchText = filterText;
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = inventory.filter(item => {
    const matchesCategory = currentCategoryFilter === 'all' || item.category === currentCategoryFilter;
    const matchesSearch =
      (item.name && item.name.toLowerCase().includes(filterText.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(filterText.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const featuredCount = inventory.filter(i => i.featured).length;

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    const imgSrc = item.image ? item.image : 'images/hero.jpg';
    const encodedImage = encodeURI(imgSrc);
    const stock = Number.isFinite(item.stock) ? item.stock : 0;
    const inStock = stock > 0;
    tr.innerHTML = `
      <td>#${sanitizeInput(item.id)}</td>
      <td><img src="${encodedImage}" alt="${sanitizeInput(item.name)}" style="width:44px; height:44px; object-fit:cover; border-radius:4px; border: 1px solid rgba(58,42,29,0.1);"></td>
      <td><strong>${sanitizeInput(item.name)}</strong></td>
      <td style="text-transform: capitalize;">${sanitizeInput(item.category)}</td>
      <td>${sanitizeInput(item.subcategory || '')}</td>
      <td>₹${sanitizeInput(item.price ? item.price.toLocaleString('en-IN') : '0')}${item.discountPercent > 0 ? `<br><span class="discount-badge">${item.discountPercent}% off</span>` : ''}</td>
      <td>${stock}</td>
      <td><span class="status-badge ${inStock ? '' : 'out-of-stock'}">${inStock ? 'In Stock' : 'Out of Stock'}</span></td>
      <td>
        <button type="button" class="star-btn ${item.featured ? 'active' : ''}" title="${item.featured ? 'Remove from Featured Pieces' : 'Add to Featured Pieces'}" onclick="toggleFeatured('${item.id}')">${item.featured ? '★' : '☆'}</button>
      </td>
      <td class="action-links">
        <button type="button" class="star-btn ${item.lowStockAlert ? 'active' : ''}" title="${item.lowStockAlert ? 'Hide the low stock alert for this piece' : 'Show \'Only X left in stock\' for this piece'}" onclick="toggleLowStockAlert('${item.id}')">${item.lowStockAlert ? '🔔' : '🔕'}</button>
        <button type="button" onclick="editItem('${item.id}')">Edit</button>
        <button type="button" class="delete" onclick="deleteItem('${item.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const featuredWarning = document.getElementById('featuredWarning');
  if (featuredWarning) {
    featuredWarning.style.display = featuredCount > 4 ? 'block' : 'none';
    featuredWarning.textContent = `${featuredCount} items are marked as Featured — only the first 4 will show on the homepage.`;
  }

  updateCategoryFilterCounts();
}

function updateCategoryFilterCounts() {
  const categoryFilterBar = document.getElementById('categoryFilterBar');
  if (!categoryFilterBar) return;
  const labels = { all: 'All', necklaces: 'Necklaces', bracelets: 'Bracelets', earrings: 'Earrings' };
  categoryFilterBar.querySelectorAll('.category-filter-btn').forEach(btn => {
    const cat = btn.dataset.cat;
    const count = cat === 'all' ? inventory.length : inventory.filter(i => i.category === cat).length;
    btn.textContent = `${labels[cat]} (${count})`;
  });
}

// Global search
const globalSearch = document.getElementById('globalSearch');
if (globalSearch) {
  globalSearch.addEventListener('input', (e) => {
    renderTable(e.target.value);
  });
}

// Category filter tabs — segregate the inventory table by category while
// keeping edit/delete/featured actions live on each visible row.
const categoryFilterBar = document.getElementById('categoryFilterBar');
if (categoryFilterBar) {
  categoryFilterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-filter-btn');
    if (!btn) return;
    currentCategoryFilter = btn.dataset.cat;
    categoryFilterBar.querySelectorAll('.category-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderTable();
  });
}

// Stats Update
function updateStats() {
  const statTotalItems = document.getElementById('statTotalItems');
  const statTotalCats = document.getElementById('statTotalCats');
  const statInStock = document.getElementById('statInStock');
  const statRestockAlerts = document.getElementById('statRestockAlerts');

  if (statTotalItems) statTotalItems.textContent = inventory.length;
  if (statTotalCats) {
    const categories = new Set(inventory.map(i => i.category));
    statTotalCats.textContent = categories.size;
  }
  if (statInStock) {
    statInStock.textContent = inventory.filter(i => i.status !== 'Inactive').length;
  }
  if (statRestockAlerts) {
    statRestockAlerts.textContent = stockNotificationCount;
  }
}

// --- Modal & CRUD ---
const modal = document.getElementById('itemModal');
const btnNewItem = document.getElementById('btnNewItem');
const closeModal = document.getElementById('closeModal');
const cancelModal = document.getElementById('cancelModal');
const itemForm = document.getElementById('itemForm');
const itemImageFile = document.getElementById('itemImageFile');
const imageManager = document.getElementById('imageManager');
const btnResetCatalog = document.getElementById('btnResetCatalog');

// Working set of images for whichever item is open in the modal. mainImageIndex
// points at the one used as the product's primary/thumbnail image.
let currentImages = [];
let mainImageIndex = 0;

function renderImageManager() {
  if (!imageManager) return;
  if (currentImages.length === 0) {
    imageManager.innerHTML = '<p class="image-manager-empty">No images yet — upload at least one below.</p>';
    return;
  }
  imageManager.innerHTML = currentImages.map((src, i) => `
    <div class="image-thumb ${i === mainImageIndex ? 'is-main' : ''}" data-index="${i}" title="${i === mainImageIndex ? 'Main image' : 'Click to set as main image'}">
      <img src="${encodeURI(src)}" alt="Product image ${i + 1}">
      ${i === mainImageIndex ? '<span class="main-badge">Main</span>' : ''}
      <button type="button" class="remove-thumb-btn" data-remove-index="${i}" aria-label="Remove image">×</button>
    </div>
  `).join('');

  imageManager.querySelectorAll('.image-thumb').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.remove-thumb-btn')) return;
      mainImageIndex = parseInt(el.dataset.index, 10);
      renderImageManager();
    });
  });
  imageManager.querySelectorAll('.remove-thumb-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.removeIndex, 10);
      currentImages.splice(idx, 1);
      if (mainImageIndex >= currentImages.length) mainImageIndex = Math.max(0, currentImages.length - 1);
      else if (idx < mainImageIndex) mainImageIndex--;
      renderImageManager();
    });
  });
}

if (itemImageFile) {
  itemImageFile.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const readers = files.map(file => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    }));

    const results = (await Promise.all(readers)).filter(Boolean);
    currentImages = currentImages.concat(results);
    itemImageFile.value = '';
    renderImageManager();
  });
}

if (btnResetCatalog) {
  btnResetCatalog.addEventListener('click', async () => {
    if (confirm('Reset inventory to default product items with real images?')) {
      const pm = getProductManager();
      try {
        inventory = await pm.resetInventoryToDefault(ADMIN_API_KEY);
        if (!Array.isArray(inventory)) {
          inventory = await pm.getProducts();
        }
        renderTable();
        updateStats();
        alert('Inventory reset successfully!');
      } catch (err) {
        handleAdminAuthError(err);
      }
    }
  });
}

if (btnNewItem) {
  btnNewItem.addEventListener('click', () => {
    if (itemForm) itemForm.reset();
    document.getElementById('itemId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Item';
    currentImages = [];
    mainImageIndex = 0;
    renderImageManager();
    if (modal) modal.classList.add('active');
  });
}

function closeAndReset() {
  if (modal) modal.classList.remove('active');
  if (itemForm) itemForm.reset();
  currentImages = [];
  mainImageIndex = 0;
  if (itemImageFile) itemImageFile.value = '';
  renderImageManager();
}

if (closeModal) closeModal.addEventListener('click', closeAndReset);
if (cancelModal) cancelModal.addEventListener('click', closeAndReset);

if (itemForm) {
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = (document.getElementById('itemId').value || '').trim() || 'item-' + Date.now().toString();
    const name = (document.getElementById('itemName').value || '').trim();
    const price = parseInt(document.getElementById('itemPrice').value) || 0;
    const discountPercent = Math.min(100, Math.max(0, parseInt(document.getElementById('itemDiscount').value, 10) || 0));
    const category = (document.getElementById('itemCategory').value || '').trim();
    const subcategory = (document.getElementById('itemSubCategory').value || '').trim();
    const stock = Math.max(0, parseInt(document.getElementById('itemStock').value, 10) || 0);
    const featured = document.getElementById('itemFeatured').checked;
    const lowStockAlert = document.getElementById('itemLowStockAlert').checked;
    const imageInput = (document.getElementById('itemImage').value || '').trim();
    const images = currentImages.length ? currentImages : [imageInput || 'images/hero.jpg'];
    const image = currentImages.length ? currentImages[mainImageIndex] : images[0];
    const desc = (document.getElementById('itemDesc').value || '').trim();

    const existingIndex = inventory.findIndex(i => i.id === id);

    const newItem = { id, name, price, discountPercent, category, subcategory, stock, featured, lowStockAlert, image, images, desc, status: 'Active' };

    if (existingIndex > -1) {
      inventory[existingIndex] = newItem;
    } else {
      inventory.push(newItem);
    }

    const pm = getProductManager();
    try {
      await pm.saveProduct(newItem, ADMIN_API_KEY);
      renderTable();
      updateStats();
      closeAndReset();
    } catch (err) {
      handleAdminAuthError(err);
    }
  });
}

// Export JSON
const btnExport = document.getElementById('btnExport');
if (btnExport) {
  btnExport.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(inventory, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "prizmoraa_inventory.json");
    a.click();
  });
}

// Expose global functions for inline HTML handlers
window.editItem = function(id) {
  const item = inventory.find(i => i.id === id);
  if(item) {
    if (itemImageFile) itemImageFile.value = '';
    currentImages = item.images && item.images.length ? [...item.images] : (item.image ? [item.image] : []);
    mainImageIndex = Math.max(0, currentImages.indexOf(item.image));
    renderImageManager();

    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemDiscount').value = Number.isFinite(item.discountPercent) ? item.discountPercent : 0;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemSubCategory').value = item.subcategory || '';
    document.getElementById('itemStock').value = Number.isFinite(item.stock) ? item.stock : 0;
    document.getElementById('itemFeatured').checked = !!item.featured;
    document.getElementById('itemLowStockAlert').checked = !!item.lowStockAlert;
    document.getElementById('itemImage').value = '';
    document.getElementById('itemDesc').value = item.desc || '';
    document.getElementById('modalTitle').textContent = 'Edit Item';
    if (modal) modal.classList.add('active');
  }
};

// Both toggles below flip the flag and re-render immediately (optimistic
// UI) rather than waiting on the save round-trip — that round-trip (Vercel
// function -> Neon over HTTP) can take a second or more, and waiting for it
// before updating the icon made the buttons feel unresponsive. The save
// still happens in the background; a failure flips the flag back and
// re-renders again.
window.toggleFeatured = async function(id) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  item.featured = !item.featured;
  renderTable();
  const pm = getProductManager();
  try {
    await pm.saveProduct(item, ADMIN_API_KEY);
  } catch (err) {
    item.featured = !item.featured;
    renderTable();
    handleAdminAuthError(err);
  }
};

window.toggleLowStockAlert = async function(id) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  item.lowStockAlert = !item.lowStockAlert;
  renderTable();
  const pm = getProductManager();
  try {
    await pm.saveProduct(item, ADMIN_API_KEY);
  } catch (err) {
    item.lowStockAlert = !item.lowStockAlert;
    renderTable();
    handleAdminAuthError(err);
  }
};

window.deleteItem = async function(id) {
  if (confirm('Are you sure you want to delete this item?')) {
    const pm = getProductManager();
    try {
      await pm.deleteProduct(id, ADMIN_API_KEY);
      inventory = inventory.filter(i => i.id !== id);
      renderTable();
      updateStats();
    } catch (err) {
      handleAdminAuthError(err);
    }
  }
};
