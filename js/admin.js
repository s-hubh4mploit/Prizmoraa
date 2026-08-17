// Admin Dashboard Logic - Universal file:// and http:// compatibility

const SESSION_KEY = 'prizmoraa_admin_token';
// NOTE: this key gates the /api/orders admin listing endpoint. Like the hardcoded
// admin/Prizmoraa2026 login below, it lives in a public JS file and is only a
// soft deterrent, not real security — anyone who views source can read it.
const ADMIN_API_KEY = 'd0d858249913b45cbf92194158abaf5fb0d764885058422e';

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

// Always land on the login screen when the admin URL is opened or reloaded —
// no session is persisted across navigations, so a stale/leftover token
// can never skip straight to the dashboard.
async function checkAuth() {
  sessionStorage.removeItem(SESSION_KEY);
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'flex';
}

// --- Security & Login ---
// Change the admin login by editing these two values.
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Prizmoraa2026';

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

// Rate limiting variables
let loginAttempts = 0;
let lockTime = null;

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (lockTime && Date.now() < lockTime) {
      if (loginError) {
        loginError.textContent = 'Too many attempts. Try again later.';
        loginError.style.display = 'block';
      }
      return;
    }
    
    const rawUser = document.getElementById('adminUsername').value || '';
    const rawPass = document.getElementById('adminPassword').value || '';
    const user = rawUser.trim().toLowerCase();
    const pass = rawPass.trim();
    
    if (user === ADMIN_USERNAME.toLowerCase() && pass === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'secure-token-abc-123');
      if (loginError) loginError.style.display = 'none';
      if (loginOverlay) loginOverlay.style.display = 'none';
      await initDashboard();
    } else {
      loginAttempts++;
      if (loginError) {
        if (loginAttempts >= 5) {
          lockTime = Date.now() + 30000;
          loginError.textContent = 'Account locked for 30s for security.';
        } else {
          loginError.textContent = 'Invalid username or password.';
        }
        loginError.style.display = 'block';
      }
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  });
}

checkAuth();

// --- Dashboard Logic ---
let inventory = [];
let uploadedImageURLs = [];

async function initDashboard() {
  const pm = getProductManager();
  inventory = await pm.getProducts();
  renderTable();
  updateStats();
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

    if (viewId === 'orders') fetchOrders();
  });
});

// --- Orders ---
async function fetchOrders() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8">Loading orders...</td></tr>';
  try {
    const res = await fetch('/api/orders', { headers: { 'x-admin-key': ADMIN_API_KEY } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      tbody.innerHTML = `<tr><td colspan="8">${sanitizeInput(data.error || 'Could not load orders.')}</td></tr>`;
      return;
    }
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">No orders yet.</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map(o => {
      const itemsText = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
      const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `
        <tr>
          <td>#${sanitizeInput(o.id)}</td>
          <td>${sanitizeInput(date)}</td>
          <td>${sanitizeInput(o.name)}</td>
          <td>${sanitizeInput(o.phone)}${o.email ? '<br>' + sanitizeInput(o.email) : ''}</td>
          <td>${sanitizeInput(itemsText)}</td>
          <td>₹${sanitizeInput(Number(o.total).toLocaleString('en-IN'))}</td>
          <td>${sanitizeInput(o.paymentId || '')}</td>
          <td><span class="status-badge">${sanitizeInput(o.status || 'paid')}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8">Could not load orders.</td></tr>';
  }
}

// Table Rendering
function renderTable(filterText = '') {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const filtered = inventory.filter(item => 
    (item.name && item.name.toLowerCase().includes(filterText.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(filterText.toLowerCase()))
  );

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
      <td>₹${sanitizeInput(item.price ? item.price.toLocaleString('en-IN') : '0')}</td>
      <td>${stock}</td>
      <td><span class="status-badge ${inStock ? '' : 'out-of-stock'}">${inStock ? 'In Stock' : 'Out of Stock'}</span></td>
      <td>
        <button type="button" class="star-btn ${item.featured ? 'active' : ''}" title="${item.featured ? 'Remove from Featured Pieces' : 'Add to Featured Pieces'}" onclick="toggleFeatured('${item.id}')">${item.featured ? '★' : '☆'}</button>
      </td>
      <td class="action-links">
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
}

// Global search
const globalSearch = document.getElementById('globalSearch');
if (globalSearch) {
  globalSearch.addEventListener('input', (e) => {
    renderTable(e.target.value);
  });
}

// Stats Update
function updateStats() {
  const statTotalItems = document.getElementById('statTotalItems');
  const statTotalCats = document.getElementById('statTotalCats');
  const statInStock = document.getElementById('statInStock');

  if (statTotalItems) statTotalItems.textContent = inventory.length;
  if (statTotalCats) {
    const categories = new Set(inventory.map(i => i.category));
    statTotalCats.textContent = categories.size;
  }
  if (statInStock) {
    statInStock.textContent = inventory.filter(i => i.status !== 'Inactive').length;
  }
}

// --- Modal & CRUD ---
const modal = document.getElementById('itemModal');
const btnNewItem = document.getElementById('btnNewItem');
const closeModal = document.getElementById('closeModal');
const cancelModal = document.getElementById('cancelModal');
const itemForm = document.getElementById('itemForm');
const itemImageFile = document.getElementById('itemImageFile');
const imagePreview = document.getElementById('imagePreview');
const btnResetCatalog = document.getElementById('btnResetCatalog');

if (itemImageFile) {
  itemImageFile.addEventListener('change', async (e) => {
    uploadedImageURLs = [];
    if (imagePreview) imagePreview.innerHTML = '';

    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const readers = files.map(file => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    }));

    const results = await Promise.all(readers);
    uploadedImageURLs = results.filter(Boolean);

    if (uploadedImageURLs.length && imagePreview) {
      imagePreview.innerHTML = uploadedImageURLs.map(src => `<img src="${src}" alt="Selected image">`).join('');
      const fileNames = files.map(file => file.name).filter(Boolean);
      document.getElementById('itemImage').value = fileNames.length > 1 ? `${fileNames.length} images selected` : fileNames[0] || 'Image selected';
    }
  });
}

if (btnResetCatalog) {
  btnResetCatalog.addEventListener('click', async () => {
    if (confirm('Reset inventory to default product items with real images?')) {
      const pm = getProductManager();
      inventory = await pm.resetInventoryToDefault();
      if (!Array.isArray(inventory)) {
        inventory = await pm.getProducts();
      }
      renderTable();
      updateStats();
      alert('Inventory reset successfully!');
    }
  });
}

if (btnNewItem) {
  btnNewItem.addEventListener('click', () => {
    if (itemForm) itemForm.reset();
    document.getElementById('itemId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Item';
    if (modal) modal.classList.add('active');
  });
}

function closeAndReset() {
  if (modal) modal.classList.remove('active');
  if (itemForm) itemForm.reset();
  uploadedImageURLs = [];
  if (itemImageFile) itemImageFile.value = '';
  if (imagePreview) imagePreview.innerHTML = '';
}

if (closeModal) closeModal.addEventListener('click', closeAndReset);
if (cancelModal) cancelModal.addEventListener('click', closeAndReset);

if (itemForm) {
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = sanitizeInput(document.getElementById('itemId').value) || 'item-' + Date.now().toString();
    const name = sanitizeInput(document.getElementById('itemName').value);
    const price = parseInt(document.getElementById('itemPrice').value) || 0;
    const category = sanitizeInput(document.getElementById('itemCategory').value);
    const subcategory = sanitizeInput(document.getElementById('itemSubCategory').value);
    const stock = Math.max(0, parseInt(document.getElementById('itemStock').value, 10) || 0);
    const featured = document.getElementById('itemFeatured').checked;
    const imageInput = sanitizeInput(document.getElementById('itemImage').value) || 'images/hero.jpg';
    const image = uploadedImageURLs.length ? uploadedImageURLs[0] : imageInput;
    const desc = sanitizeInput(document.getElementById('itemDesc').value);

    const existingIndex = inventory.findIndex(i => i.id === id);
    const existingItem = inventory[existingIndex] || {};
    const images = uploadedImageURLs.length ? uploadedImageURLs : (existingItem.images ? existingItem.images : [image]);

    const newItem = { id, name, price, category, subcategory, stock, featured, image, images, desc, status: 'Active' };

    if (existingIndex > -1) {
      inventory[existingIndex] = newItem;
    } else {
      inventory.push(newItem);
    }

    const pm = getProductManager();
    await pm.saveProduct(newItem);
    renderTable();
    updateStats();
    closeAndReset();
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
    uploadedImageURLs = [];
    if (itemImageFile) itemImageFile.value = '';
    if (imagePreview) imagePreview.innerHTML = '';

    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemSubCategory').value = item.subcategory || '';
    document.getElementById('itemStock').value = Number.isFinite(item.stock) ? item.stock : 0;
    document.getElementById('itemFeatured').checked = !!item.featured;
    document.getElementById('itemImage').value = item.image || '';
    document.getElementById('itemDesc').value = item.desc || '';
    document.getElementById('modalTitle').textContent = 'Edit Item';
    if (modal) modal.classList.add('active');
  }
};

window.toggleFeatured = async function(id) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  item.featured = !item.featured;
  const pm = getProductManager();
  await pm.saveProduct(item);
  renderTable();
};

window.deleteItem = async function(id) {
  if (confirm('Are you sure you want to delete this item?')) {
    inventory = inventory.filter(i => i.id !== id);
    const pm = getProductManager();
    await pm.deleteProduct(id);
    renderTable();
    updateStats();
  }
};
