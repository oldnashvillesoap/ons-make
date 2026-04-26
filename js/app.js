/* ============================================================
   ONS Make — Soap & Cosmetics Business Manager
   ============================================================ */

'use strict';

const PRODUCT_CATEGORIES      = ['Bar Soap','Bath Salts','Deodorant','Lip Balm','Pet Soap','Shampoo Bar','Sugar Scrub'];
const RAW_MATERIAL_CATEGORIES = ['Additives','Chemicals','Colorant','Flavoring','Fragrance','Hard oils','Liquids','Liquid oils','Packaging','Preservative','Salt'];
const UNITS = ['batch','each','g','gal','fl-oz','oz','lb'];

function unitSelect(id, selected, attrs = '') {
  return `<select id="${id}" ${attrs}>
    <option value="">— Select unit —</option>
    ${UNITS.map(u => `<option value="${u}" ${selected===u?'selected':''}>${u}</option>`).join('')}
  </select>`;
}

// ─── STATE ──────────────────────────────────────────────────
const state = {
  inventory:    [],
  recipes:      [],
  batches:      [],
  transactions: [],
  view: 'dashboard',
  invFilter:    'all',
  invSearch:    '',
  recipeSearch: '',
  recipeFilter: '',
  batchSearch:  '',
  batchFilter:  '',
  txFilter:     'all',
  txSearch:     '',
};

let db;
let auth;
let _ingredients = []; // active ingredient rows in open form

// ─── INIT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  db   = firebase.firestore();
  auth = firebase.auth();
  setupNav();
  setupModal();

  document.getElementById('btn-google-signin').addEventListener('click', async () => {
    document.getElementById('login-error').classList.add('hidden');
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (e) {
      console.error('Sign-in failed:', e);
    }
  });

  auth.onAuthStateChanged(async user => {
    if (user) {
      try {
        const entry = await db.collection('allowed_users').doc(user.uid).get();
        if (!entry.exists) {
          await auth.signOut();
          showLoginError('Access denied. Ask an admin to add your account.');
          return;
        }
      } catch (e) {
        await auth.signOut();
        showLoginError('Access denied. Ask an admin to add your account.');
        return;
      }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      renderSidebarUser(user);
      await loadAll();
      navigate('dashboard');
    } else {
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
    }
  });
});

function renderSidebarUser(user) {
  document.getElementById('sidebar-user').innerHTML = `
    <div class="sidebar-user-info">
      ${user.photoURL
        ? `<img src="${escHtml(user.photoURL)}" class="sidebar-user-avatar" alt="">`
        : `<span class="material-icons" style="font-size:28px;color:var(--text-muted)">account_circle</span>`}
      <span class="sidebar-user-name">${escHtml(user.displayName || user.email || 'User')}</span>
    </div>
    <button class="btn-signout" onclick="signOut()">
      <span class="material-icons" style="font-size:16px">logout</span>Sign out
    </button>`;
}

window.signOut = () => auth.signOut();

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.view);
    });
  });
}

function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('modal-save').addEventListener('click', () => {
    if (window._onSave) window._onSave();
  });
}

// ─── FIRESTORE HELPERS ───────────────────────────────────────
async function getCollection(name) {
  try {
    const snap = await db.collection(name).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Load error:', name, err);
    return [];
  }
}

async function addDoc(col, data) {
  const ref = await db.collection(col).add(data);
  return ref.id;
}

async function updateDoc(col, id, data) {
  await db.collection(col).doc(id).update(data);
}

async function deleteDoc(col, id) {
  await db.collection(col).doc(id).delete();
}

async function adjustStock(itemId, delta) {
  if (!itemId || delta === 0) return;
  await db.collection('inventory_items').doc(itemId).update({
    stock_on_hand: firebase.firestore.FieldValue.increment(+delta),
  });
}

// Increment stock and weighted-average the unit cost for additions.
async function addStockWeighted(itemId, qty, costPerUnit) {
  if (!itemId || !(qty > 0)) return;
  const item         = state.inventory.find(i => i.id === itemId);
  const currentStock = Math.max(0, item?.stock_on_hand ?? 0);
  const currentCpu   = item?.cost_per_unit ?? 0;
  const newStock     = currentStock + qty;
  const update = { stock_on_hand: firebase.firestore.FieldValue.increment(+qty) };
  if (costPerUnit > 0) {
    update.cost_per_unit = +((currentStock * currentCpu + qty * costPerUnit) / newStock).toFixed(4);
  }
  await db.collection('inventory_items').doc(itemId).update(update);
}

async function recordItemTransaction(type, itemId, itemName, unit, qty, costPerUnit, reason, batchId, date) {
  if (!itemId || !(qty > 0)) return;
  await addDoc('inventory_transactions', {
    type, item_id: itemId, item_name: itemName,
    quantity:      +qty.toFixed(4),
    unit,
    cost_per_unit: +costPerUnit.toFixed(4),
    total_cost:    +(qty * costPerUnit).toFixed(4),
    reason, batch_id: batchId, date,
  });
  if (type === 'addition') {
    await addStockWeighted(itemId, +qty, costPerUnit);
  } else {
    await adjustStock(itemId, -qty);
  }
}

async function deductBatchIngredients(ingredients, batchId, date) {
  for (const ing of ingredients.filter(i => i.item_id && (i.quantity || 0) > 0)) {
    await addDoc('inventory_transactions', {
      type: 'deduction', item_id: ing.item_id, item_name: ing.name,
      quantity: ing.quantity, unit: ing.unit,
      cost_per_unit: ing.cost_per_unit || 0, total_cost: ing.line_cost || 0,
      reason: 'production', batch_id: batchId, date,
    });
    await adjustStock(ing.item_id, -(ing.quantity));
  }
}

async function reverseBatchIngredients(ingredients, batchId, date) {
  for (const ing of ingredients.filter(i => i.item_id && (i.quantity || 0) > 0)) {
    await addDoc('inventory_transactions', {
      type: 'addition', item_id: ing.item_id, item_name: ing.name,
      quantity: ing.quantity, unit: ing.unit,
      cost_per_unit: ing.cost_per_unit || 0, total_cost: ing.line_cost || 0,
      reason: 'production reversal', batch_id: batchId, date,
    });
    await addStockWeighted(ing.item_id, ing.quantity, ing.cost_per_unit || 0);
  }
}

async function loadAll() {
  const [inv, rec, bat, txn] = await Promise.all([
    getCollection('inventory_items'),
    getCollection('recipes'),
    getCollection('batches'),
    getCollection('inventory_transactions'),
  ]);
  state.inventory    = inv;
  state.recipes      = rec;
  state.batches      = bat;
  state.transactions = txn;
}

async function reload(col) {
  state[colKey(col)] = await getCollection(col);
}

function colKey(col) {
  return { inventory_items: 'inventory', recipes: 'recipes', batches: 'batches', inventory_transactions: 'transactions' }[col];
}

// ─── ROUTER ─────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view));
  const main = document.getElementById('main');
  const renders = {
    dashboard:    renderDashboard,
    inventory:    renderInventory,
    recipes:      renderRecipes,
    batches:      renderBatches,
    transactions: renderTransactions,
    help:         renderHelp,
  };
  main.innerHTML = renders[view]();
  const setups = {
    inventory:    setupInventoryEvents,
    recipes:      setupRecipeEvents,
    batches:      setupBatchEvents,
    transactions: setupTransactionEvents,
    help:         setupHelpEvents,
  };
  if (setups[view]) setups[view]();
}

// ─── TOAST ──────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

// ─── MODAL ──────────────────────────────────────────────────
function openModal(title, bodyHTML, onSave, large = false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal').className = large ? 'modal lg' : 'modal';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-footer').style.display = '';
  window._onSave = onSave;
}

function openViewModal(title, bodyHTML) {
  openModal(title, bodyHTML, null);
  document.getElementById('modal-footer').style.display = 'none';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  window._onSave = null;
  _ingredients = [];
}

// ─── HELPERS ────────────────────────────────────────────────
function fmt(n) { return typeof n === 'number' ? n.toFixed(2) : '—'; }
function fmtCur(n, cur = 'USD') { return typeof n === 'number' ? `$${n.toFixed(2)}` : '—'; }
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function val(id) { return (document.getElementById(id) || {}).value || ''; }
function numVal(id) { return parseFloat(val(id)) || 0; }

function batchAge(dateStr) {
  if (!dateStr) return '—';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 0)   return '—';
  if (days < 7)   return `${days}d`;
  if (days < 60)  return `${Math.floor(days / 7)}wk`;
  if (days < 730) return `${Math.floor(days / 30.44)}mo`;
  return `${Math.floor(days / 365.25)}yr`;
}

function batchStatusBadge(status) {
  const map = { in_progress: 'blue', curing: 'amber', complete: 'green', failed: 'red' };
  return `<span class="badge badge-${map[status] || 'gray'}">${escHtml(status?.replace('_',' ') || '—')}</span>`;
}

function typeBadge(type) {
  if (type === 'raw_material')     return `<span class="badge badge-blue">Raw Material</span>`;
  if (type === 'finished_product') return `<span class="badge badge-green">Finished</span>`;
  if (type === 'wip')              return `<span class="badge badge-amber">WIP</span>`;
  return `<span class="badge badge-gray">${escHtml(type || '—')}</span>`;
}

function txTypeBadge(type) {
  return type === 'addition'
    ? `<span class="badge badge-green">Addition</span>`
    : `<span class="badge badge-red">Deduction</span>`;
}

// ─── SEARCH SELECT ──────────────────────────────────────────
function buildSearchSelect({ containerId, placeholder, items, selectedId, onSelect }) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const sel = items.find(i => i.id === selectedId);
  container.innerHTML = `
    <input type="text" class="ss-input" value="${escHtml(sel ? sel.label : '')}"
           placeholder="${escHtml(placeholder)}" autocomplete="off">
    <input type="hidden" class="ss-value" value="${escHtml(selectedId || '')}">
    <div class="ss-list hidden"></div>`;

  const input  = container.querySelector('.ss-input');
  const hidden = container.querySelector('.ss-value');
  const list   = container.querySelector('.ss-list');

  function renderList(q) {
    const lower    = q.toLowerCase();
    const filtered = lower ? items.filter(i => i.label.toLowerCase().includes(lower)) : items;
    list.innerHTML = filtered.length
      ? filtered.map(i => `<div class="ss-option" data-value="${escHtml(i.id)}">${escHtml(i.label)}</div>`).join('')
      : `<div class="ss-empty">No results</div>`;
    list.classList.remove('hidden');
  }

  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('blur',  () => setTimeout(() => list.classList.add('hidden'), 200));
  list.addEventListener('mousedown', e => {
    const opt = e.target.closest('.ss-option');
    if (!opt) return;
    hidden.value = opt.dataset.value;
    input.value  = opt.textContent;
    list.classList.add('hidden');
    onSelect(opt.dataset.value, opt.textContent);
  });
}

// ─── DASHBOARD ──────────────────────────────────────────────
function invValue(type) {
  return state.inventory
    .filter(i => i.type === type)
    .reduce((s, i) => s + (i.stock_on_hand ?? 0) * (i.cost_per_unit ?? 0), 0);
}

function renderDashboard() {
  const lowStockSort = (a, b) => (a.stock_on_hand ?? 0) - (b.stock_on_hand ?? 0) || (a.name || '').localeCompare(b.name || '');
  const lowStockRaw  = state.inventory.filter(i => i.type === 'raw_material' && (i.stock_on_hand ?? 0) <= (i.reorder_threshold ?? 0)).sort(lowStockSort);
  const lowStockFin  = state.inventory.filter(i => i.type === 'finished_product' && (i.stock_on_hand ?? 0) <= (i.reorder_threshold ?? 0)).sort(lowStockSort);
  const lowStock     = [...lowStockRaw, ...lowStockFin];
  const active   = state.batches.filter(b => b.status === 'in_progress' || b.status === 'curing');
  const recent   = [...state.batches].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const rawVal      = invValue('raw_material');
  const wipVal      = invValue('wip');
  const finishedVal = invValue('finished_product');

  const lowStockTableRows = items => items.length
    ? items.map(i => `
        <tr>
          <td class="font-medium">${escHtml(i.name)}</td>
          <td class="low-stock font-mono">${i.stock_on_hand ?? 0} ${escHtml(i.unit || '')}</td>
          <td class="text-muted font-mono">${i.reorder_threshold ?? 0} ${escHtml(i.unit || '')}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="text-center text-muted" style="padding:16px">None</td></tr>`;

  const recentRows = recent.length
    ? recent.map(b => `
        <tr>
          <td class="font-medium">${escHtml(b.recipe_name || '—')}</td>
          <td class="text-muted">${escHtml(b.date || '—')}</td>
          <td>${batchStatusBadge(b.status)}</td>
          <td class="font-mono">${b.yield_quantity ?? '—'} ${escHtml(b.yield_unit || '')}</td>
          <td class="font-mono">${fmtCur(b.cost_per_unit)}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="text-center text-muted" style="padding:24px">No batches yet</td></tr>`;

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-sub">Overview of your soap &amp; cosmetics business</div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="card stat-card">
        <div>
          <div class="stat-label">Raw Materials</div>
          <div class="stat-value stat-value-currency">${fmtCur(rawVal)}</div>
        </div>
        <div class="stat-icon blue"><span class="material-icons">science</span></div>
      </div>
      <div class="card stat-card">
        <div>
          <div class="stat-label">WIP</div>
          <div class="stat-value stat-value-currency">${fmtCur(wipVal)}</div>
        </div>
        <div class="stat-icon amber"><span class="material-icons">pending</span></div>
      </div>
      <div class="card stat-card">
        <div>
          <div class="stat-label">Finished Goods</div>
          <div class="stat-value stat-value-currency">${fmtCur(finishedVal)}</div>
        </div>
        <div class="stat-icon green"><span class="material-icons">inventory_2</span></div>
      </div>
      <div class="card stat-card">
        <div>
          <div class="stat-label">Low Stock Items</div>
          <div class="stat-value" style="color:${lowStock.length ? 'var(--danger)' : 'inherit'}">${lowStock.length}</div>
        </div>
        <div class="stat-icon red"><span class="material-icons">warning</span></div>
      </div>
      <div class="card stat-card">
        <div>
          <div class="stat-label">Active Batches</div>
          <div class="stat-value">${active.length}</div>
        </div>
        <div class="stat-icon purple"><span class="material-icons">pending</span></div>
      </div>
    </div>

    <div class="section card" style="margin-bottom:20px">
      <div class="section-header">
        <span class="section-title">⚠ Low Stock Alerts</span>
        <span class="badge badge-${lowStock.length ? 'red' : 'green'}">${lowStock.length} item${lowStock.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div class="section-title" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">Raw Materials</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>On Hand</th><th>Reorder At</th></tr></thead>
              <tbody>${lowStockTableRows(lowStockRaw)}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="section-title" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px">Finished Products</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>On Hand</th><th>Reorder At</th></tr></thead>
              <tbody>${lowStockTableRows(lowStockFin)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="section card">
      <div class="section-header">
        <span class="section-title">Recent Batches</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Recipe</th><th>Date</th><th>Status</th><th>Yield</th><th>Cost / Unit</th>
          </tr></thead>
          <tbody>${recentRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─── INVENTORY ──────────────────────────────────────────────
function invRows() {
  const f = state.invFilter;
  const q = state.invSearch.toLowerCase();
  const items = state.inventory
    .filter(i => f === 'all' || i.type === f)
    .filter(i => !q || (i.name||'').toLowerCase().includes(q) || (i.category||'').toLowerCase().includes(q) || (i.supplier||'').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!items.length) return `<tr><td colspan="8"><div class="empty-state"><span class="material-icons">inventory_2</span><h3>No items found</h3><p>Add your first inventory item to get started.</p></div></td></tr>`;
  return items.map(i => `
    <tr class="clickable" ondblclick="openInventoryEdit('${i.id}')">
      <td class="font-medium">${escHtml(i.name)}</td>
      <td>${typeBadge(i.type)}</td>
      <td>${escHtml(i.category || '—')}</td>
      <td class="font-mono ${(i.stock_on_hand ?? 0) <= (i.reorder_threshold ?? 0) ? 'low-stock' : ''}">
        ${i.stock_on_hand ?? 0} ${escHtml(i.unit || '')}
      </td>
      <td class="font-mono text-muted">${i.reorder_threshold ?? 0} ${escHtml(i.unit || '')}</td>
      <td class="font-mono">${fmtCur(i.cost_per_unit)}/${escHtml(i.unit||'unit')}${i.production_unit && i.production_unit !== i.unit ? `<br><span class="text-muted" style="font-size:11px">${fmtCur(i.cost_per_unit / (i.conversion_factor||1))}/${escHtml(i.production_unit)}</span>` : ''}</td>
      <td>${escHtml(i.supplier || '—')}</td>
      <td>
        <div class="actions">
          <button class="btn-icon" onclick="openInventoryEdit('${i.id}')" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon danger" onclick="deleteInventoryItem('${i.id}','${escHtml(i.name)}')" title="Delete"><span class="material-icons">delete</span></button>
        </div>
      </td>
    </tr>`).join('');
}

function renderInventory() {
  const f = state.invFilter;
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Inventory</div>
        <div class="page-sub">Raw materials and finished products</div>
      </div>
      <button class="btn btn-primary" onclick="openInventoryAdd()">
        <span class="material-icons">add</span>Add Item
      </button>
    </div>
    <div class="tabs" id="inv-tabs">
      <button class="tab ${f==='all'?'active':''}" data-filter="all">All (${state.inventory.length})</button>
      <button class="tab ${f==='raw_material'?'active':''}" data-filter="raw_material">Raw Materials</button>
      <button class="tab ${f==='wip'?'active':''}" data-filter="wip">WIP</button>
      <button class="tab ${f==='finished_product'?'active':''}" data-filter="finished_product">Finished Products</button>
    </div>
    <div class="card">
      <div class="table-toolbar">
        <div class="toolbar-filters"></div>
        <div class="toolbar-search">
          <span class="material-icons">search</span>
          <input type="text" placeholder="Search name, category, supplier…" value="${escHtml(state.invSearch)}" oninput="onInvSearch(this.value)">
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Type</th><th>Category</th><th>On Hand</th>
            <th>Reorder At</th><th>Cost</th><th>Supplier</th><th></th>
          </tr></thead>
          <tbody id="inv-tbody">${invRows()}</tbody>
        </table>
      </div>
    </div>`;
}

function setupInventoryEvents() {
  document.getElementById('inv-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.invFilter = tab.dataset.filter;
    navigate('inventory');
  });
}

window.onInvTypeChange = function(type) {
  const sel = document.getElementById('f-category');
  if (!sel) return;
  const cats = type === 'raw_material' ? RAW_MATERIAL_CATEGORIES : PRODUCT_CATEGORIES;
  sel.innerHTML = `<option value="">— Select category —</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
};

window.onInvSearch = function(q) {
  state.invSearch = q;
  const el = document.getElementById('inv-tbody');
  if (el) el.innerHTML = invRows();
};

window.openInventoryAdd = function () {
  openModal('Add Inventory Item', inventoryForm(null), saveInventoryItem);
};

window.openInventoryEdit = function (id) {
  const item = state.inventory.find(i => i.id === id);
  if (!item) return;
  openModal('Edit Inventory Item', inventoryForm(item), () => saveInventoryItem(id));
};

window.deleteInventoryItem = async function (id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await deleteDoc('inventory_items', id);
    await reload('inventory_items');
    toast('Item deleted');
    navigate('inventory');
  } catch (e) { toast('Delete failed', 'error'); }
};

function inventoryForm(item) {
  const d = item || {};
  return `
    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input id="f-name" type="text" value="${escHtml(d.name||'')}" placeholder="e.g. Olive Oil">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="f-type" onchange="onInvTypeChange(this.value)">
          <option value="raw_material"    ${d.type==='raw_material'?'selected':''}>Raw Material</option>
          <option value="wip"             ${d.type==='wip'?'selected':''}>WIP</option>
          <option value="finished_product"${d.type==='finished_product'?'selected':''}>Finished Product</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category</label>
        <select id="f-category">
          <option value="">— Select category —</option>
          ${(d.type === 'raw_material' ? RAW_MATERIAL_CATEGORIES : PRODUCT_CATEGORIES).map(c =>
            `<option value="${c}" ${d.category===c?'selected':''}>${c}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Purchase Unit</label>
        ${unitSelect('f-unit', d.unit||'')}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Production Unit <span class="text-muted" style="font-weight:400">(used in recipes — leave blank if same as purchase)</span></label>
        ${unitSelect('f-production-unit', d.production_unit||'')}
      </div>
      <div class="form-group">
        <label>Conversion <span class="text-muted" style="font-weight:400">(production ÷ purchase)</span></label>
        <input id="f-conversion" type="number" min="0" step="any" value="${d.conversion_factor||''}" placeholder="e.g. 3785 for gal→g">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Stock on Hand</label>
        <input id="f-stock" type="number" min="0" step="any" value="${d.stock_on_hand??''}">
      </div>
      <div class="form-group">
        <label>Reorder Threshold</label>
        <input id="f-reorder" type="number" min="0" step="any" value="${d.reorder_threshold??''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Cost per Unit ($)</label>
        <input id="f-cost" type="number" min="0" step="any" value="${d.cost_per_unit??''}">
      </div>
      <div class="form-group">
        <label>Supplier</label>
        <input id="f-supplier" type="text" value="${escHtml(d.supplier||'')}" placeholder="Optional">
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="f-notes" placeholder="Optional notes…">${escHtml(d.notes||'')}</textarea>
    </div>`;
}

async function saveInventoryItem(id) {
  const name = val('f-name').trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const purchaseUnit    = val('f-unit').trim();
  const productionUnit  = val('f-production-unit').trim();
  const conversionFactor = numVal('f-conversion') || 1;
  const data = {
    name,
    type:              val('f-type'),
    category:          val('f-category').trim(),
    unit:              purchaseUnit,
    production_unit:   productionUnit || purchaseUnit,
    conversion_factor: conversionFactor,
    stock_on_hand:     numVal('f-stock'),
    reorder_threshold: numVal('f-reorder'),
    cost_per_unit:     numVal('f-cost'),
    currency:          'USD',
    supplier:          val('f-supplier').trim(),
    notes:             val('f-notes').trim(),
  };
  try {
    if (id) {
      const oldItem = state.inventory.find(i => i.id === id);
      const oldQty  = oldItem?.stock_on_hand ?? 0;
      const newQty  = data.stock_on_hand;
      await updateDoc('inventory_items', id, data);
      if (oldQty !== newQty) {
        const delta = newQty - oldQty;
        await addDoc('inventory_transactions', {
          type:          delta > 0 ? 'addition' : 'deduction',
          item_id:       id,
          item_name:     data.name,
          quantity:      Math.abs(delta),
          unit:          data.unit,
          cost_per_unit: data.cost_per_unit,
          total_cost:    +Math.abs(delta * data.cost_per_unit).toFixed(4),
          reason:        'reconciliation',
          batch_id:      '',
          date:          new Date().toISOString(),
        });
        await reload('inventory_transactions');
      }
    } else {
      await addDoc('inventory_items', data);
    }
    await reload('inventory_items');
    toast(id ? 'Item updated' : 'Item added');
    closeModal();
    navigate('inventory');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── RECIPES ────────────────────────────────────────────────
function recipeRows() {
  const q = state.recipeSearch.toLowerCase();
  const cf = state.recipeFilter;
  const recipes = state.recipes
    .filter(r => !cf || r.category === cf)
    .filter(r => !q || (r.name||'').toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q) || (r.finished_product_name||'').toLowerCase().includes(q))
    .sort((a,b) => (a.name||'').localeCompare(b.name||''));
  if (!recipes.length) return `<tr><td colspan="9"><div class="empty-state"><span class="material-icons">menu_book</span><h3>No recipes found</h3><p>Create your first recipe formula.</p></div></td></tr>`;
  return recipes.map(r => `
    <tr class="clickable" ondblclick="openRecipeEdit('${r.id}')">
      <td class="font-medium">${escHtml(r.name)}</td>
      <td>${escHtml(r.category || '—')}</td>
      <td class="text-muted">${escHtml(r.wip_product_name || '—')}</td>
      <td class="text-muted">${escHtml(r.finished_product_name || '—')}</td>
      <td class="font-mono">${r.yield_quantity ?? '—'} ${escHtml(r.yield_unit||'')}</td>
      <td class="font-mono">${(r.ingredients||[]).length}</td>
      <td class="font-mono">${fmtCur(r.estimated_batch_cost)}</td>
      <td class="font-mono">${fmtCur(r.estimated_cost_per_unit)}</td>
      <td><div class="actions"><button class="btn-icon" onclick="openRecipeEdit('${r.id}')" title="Edit"><span class="material-icons">edit</span></button></div></td>
    </tr>`).join('');
}

function renderRecipes() {
  return `
    <div class="page-header">
      <div><div class="page-title">Recipes</div><div class="page-sub">Product formulas and cost estimates</div></div>
      <button class="btn btn-primary" onclick="openRecipeAdd()"><span class="material-icons">add</span>New Recipe</button>
    </div>
    <div class="card">
      <div class="table-toolbar">
        <div class="toolbar-filters">
          <select onchange="onRecipeFilter(this.value)">
            <option value="">All categories</option>
            ${PRODUCT_CATEGORIES.map(c => `<option value="${c}" ${state.recipeFilter===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-search">
          <span class="material-icons">search</span>
          <input type="text" placeholder="Search name, category, product…" value="${escHtml(state.recipeSearch)}" oninput="onRecipeSearch(this.value)">
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Category</th><th>WIP Product</th><th>Finished Product</th>
            <th>Yield</th><th>Ingredients</th><th>Batch Cost</th><th>Cost / Unit</th><th></th>
          </tr></thead>
          <tbody id="recipe-tbody">${recipeRows()}</tbody>
        </table>
      </div>
    </div>`;
}

function setupRecipeEvents() {}

window.onRecipeSearch = function(q) {
  state.recipeSearch = q;
  const el = document.getElementById('recipe-tbody');
  if (el) el.innerHTML = recipeRows();
};

window.onRecipeFilter = function(v) {
  state.recipeFilter = v;
  const el = document.getElementById('recipe-tbody');
  if (el) el.innerHTML = recipeRows();
};

window.openRecipeAdd = function () {
  _ingredients = [];
  openModal('New Recipe', recipeForm(null), saveRecipe, true);
  setupRecipeFormSearch(null);
};

window.openRecipeEdit = function (id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  _ingredients = (r.ingredients || []).map(ing => ({ ...ing }));
  openModal('Edit Recipe', recipeForm(r), () => saveRecipe(id), true);
  setupRecipeFormSearch(r);
  refreshIngredientRows('recipe');
};

function setupRecipeFormSearch(r) {
  if (document.getElementById('ss-copy-from')) {
    buildSearchSelect({
      containerId: 'ss-copy-from',
      placeholder: 'Search recipes…',
      items: state.recipes.map(x => ({ id: x.id, label: x.name })),
      selectedId: '',
      onSelect: id => onCopyFromRecipe(id),
    });
  }

  buildSearchSelect({
    containerId: 'ss-recipe-wip',
    placeholder: 'Search WIP products…',
    items: state.inventory.filter(i => i.type === 'wip').map(i => ({ id: i.id, label: i.name })),
    selectedId: r?.wip_product_id || '',
    onSelect: () => {},
  });

  buildSearchSelect({
    containerId: 'ss-recipe-finished',
    placeholder: 'Search finished products…',
    items: state.inventory.filter(i => i.type === 'finished_product').map(i => ({ id: i.id, label: i.name })),
    selectedId: r?.finished_product_id || '',
    onSelect: id => {
      const item = state.inventory.find(i => i.id === id);
      if (!item) return;
      const yieldUnit = document.getElementById('f-yield-unit');
      if (yieldUnit) yieldUnit.value = item.unit || '';
    },
  });
}

window.onCopyFromRecipe = function(recipeId) {
  const source = state.recipes.find(x => x.id === recipeId);
  if (!source) return;

  const nameEl = document.getElementById('f-name');
  if (nameEl && !nameEl.value) nameEl.value = source.name;

  const catEl = document.getElementById('f-category');
  if (catEl) catEl.value = source.category || '';

  const yieldQtyEl = document.getElementById('f-yield-qty');
  if (yieldQtyEl) yieldQtyEl.value = source.yield_quantity ?? '';

  const yieldUnitEl = document.getElementById('f-yield-unit');
  if (yieldUnitEl) yieldUnitEl.value = source.yield_unit || '';

  const notesEl = document.getElementById('f-notes');
  if (notesEl) notesEl.value = source.notes || '';

  _ingredients = (source.ingredients || []).map(i => ({ ...i }));
  refreshIngredientRows('recipe');
  updateCostSummary('recipe');

  // Rebuild product selects with source's selections
  buildSearchSelect({
    containerId: 'ss-recipe-wip',
    placeholder: 'Search WIP products…',
    items: state.inventory.filter(i => i.type === 'wip').map(i => ({ id: i.id, label: i.name })),
    selectedId: source.wip_product_id || '',
    onSelect: () => {},
  });
  buildSearchSelect({
    containerId: 'ss-recipe-finished',
    placeholder: 'Search finished products…',
    items: state.inventory.filter(i => i.type === 'finished_product').map(i => ({ id: i.id, label: i.name })),
    selectedId: source.finished_product_id || '',
    onSelect: id => {
      const item = state.inventory.find(i => i.id === id);
      if (item) { const el = document.getElementById('f-yield-unit'); if (el) el.value = item.unit || ''; }
    },
  });
};

window.onAutoCreateToggle = function(which, checked) {
  const ssId = which === 'wip' ? 'ss-recipe-wip' : 'ss-recipe-finished';
  const input  = document.querySelector(`#${ssId} .ss-input`);
  const hidden = document.querySelector(`#${ssId} .ss-value`);
  const list   = document.querySelector(`#${ssId} .ss-list`);
  if (!input) return;
  if (checked) {
    input.value  = '';
    if (hidden) hidden.value = '';
    if (list)   list.classList.add('hidden');
    input.disabled = true;
    input.placeholder = '(will be created on save)';
  } else {
    input.disabled    = false;
    input.placeholder = which === 'wip' ? 'Search WIP products…' : 'Search finished products…';
  }
};

window.deleteRecipe = async function (id, name) {
  if (!confirm(`Delete recipe "${name}"?`)) return;
  try {
    await deleteDoc('recipes', id);
    await reload('recipes');
    toast('Recipe deleted');
    closeModal();
    navigate('recipes');
  } catch (e) { toast('Delete failed', 'error'); }
};

function recipeForm(r) {
  const d = r || {};
  return `
    ${!r ? `
    <div class="form-group">
      <label>Copy from existing recipe <span class="text-muted" style="font-weight:400;text-transform:none">(optional)</span></label>
      <div class="search-select" id="ss-copy-from"></div>
    </div>
    <div class="divider"></div>` : ''}
    <div class="form-row">
      <div class="form-group">
        <label>Recipe Name</label>
        <input id="f-name" type="text" value="${escHtml(d.name||'')}" placeholder="e.g. Lavender Bar Soap">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="f-category">
          <option value="">— Select category —</option>
          ${PRODUCT_CATEGORIES.map(c =>
            `<option value="${c}" ${d.category===c?'selected':''}>${c}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="label-with-action">
          WIP Product
          ${!r ? `<label class="checkbox-label"><input type="checkbox" id="chk-create-wip" onchange="onAutoCreateToggle('wip',this.checked)"> Auto-create</label>` : ''}
        </label>
        <div class="search-select" id="ss-recipe-wip"></div>
      </div>
      <div class="form-group">
        <label class="label-with-action">
          Finished Product
          ${!r ? `<label class="checkbox-label"><input type="checkbox" id="chk-create-finished" onchange="onAutoCreateToggle('finished',this.checked)"> Auto-create</label>` : ''}
        </label>
        <div class="search-select" id="ss-recipe-finished"></div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Yield Quantity</label>
        <input id="f-yield-qty" type="number" min="0" step="any" value="${d.yield_quantity??''}" oninput="updateCostSummary('recipe')">
      </div>
      <div class="form-group">
        <label>Yield Unit <span class="text-muted" style="font-weight:400;text-transform:none">(from finished product)</span></label>
        ${unitSelect('f-yield-unit', d.yield_unit||'')}
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="f-notes">${escHtml(d.notes||'')}</textarea>
    </div>
    <div class="divider"></div>
    <label>Ingredients</label>
    <div class="ingredient-section">
      <div class="ingredient-header">
        <span>Item</span><span>Qty</span><span>Unit</span><span style="text-align:right">Line Cost</span><span></span>
      </div>
      <div id="ingredient-rows"></div>
      <button type="button" class="add-ingredient-btn" onclick="addIngredientRow('recipe')">
        <span class="material-icons" style="font-size:15px">add</span> Add Ingredient
      </button>
    </div>
    <div id="cost-summary" class="cost-summary" style="margin-top:16px">
      <div class="cost-row"><span>Estimated Batch Cost</span><span id="cs-batch">$0.00</span></div>
      <div class="cost-row total"><span>Cost per Unit</span><span id="cs-unit">$0.00</span></div>
    </div>
    ${r ? `
    <div style="margin-top:16px;text-align:right">
      <button class="btn btn-danger" onclick="deleteRecipe('${r.id}','${escHtml(r.name)}')">
        <span class="material-icons">delete</span>Delete Recipe
      </button>
    </div>` : ''}`;
}

async function saveRecipe(id) {
  const name = val('f-name').trim();
  if (!name) { toast('Name is required', 'error'); return; }
  collectIngredientInputs();
  const yieldQty  = numVal('f-yield-qty');
  const yieldUnit = val('f-yield-unit').trim();
  const category  = val('f-category').trim();
  const totalCost = _ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);

  let wipId      = document.querySelector('#ss-recipe-wip .ss-value')?.value      || '';
  let finishedId = document.querySelector('#ss-recipe-finished .ss-value')?.value || '';
  let wipName      = state.inventory.find(i => i.id === wipId)?.name      || '';
  let finishedName = state.inventory.find(i => i.id === finishedId)?.name || '';

  // Auto-create materials (new recipes only)
  if (!id) {
    const baseItem = { stock_on_hand: 0, reorder_threshold: 0, cost_per_unit: 0, category };
    if (document.getElementById('chk-create-wip')?.checked && !wipId) {
      wipId   = await addDoc('inventory_items', { ...baseItem, name, type: 'wip', unit: 'batch', production_unit: 'batch' });
      wipName = name;
    }
    if (document.getElementById('chk-create-finished')?.checked && !finishedId) {
      const unit = yieldUnit || 'each';
      finishedId   = await addDoc('inventory_items', { ...baseItem, name, type: 'finished_product', unit, production_unit: unit });
      finishedName = name;
    }
  }

  const data = {
    name,
    category,
    yield_quantity:          yieldQty,
    yield_unit:              yieldUnit,
    notes:                   val('f-notes').trim(),
    ingredients:             _ingredients,
    estimated_batch_cost:    +totalCost.toFixed(4),
    estimated_cost_per_unit: yieldQty > 0 ? +(totalCost / yieldQty).toFixed(4) : 0,
    wip_product_id:          wipId,
    wip_product_name:        wipName,
    finished_product_id:     finishedId,
    finished_product_name:   finishedName,
  };
  try {
    if (id) { await updateDoc('recipes', id, data); }
    else    { await addDoc('recipes', data); }
    await reload('recipes');
    await reload('inventory_items');
    toast(id ? 'Recipe updated' : 'Recipe created');
    closeModal();
    navigate('recipes');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── BATCHES ────────────────────────────────────────────────
function batchRows() {
  const q = state.batchSearch.toLowerCase();
  const sf = state.batchFilter;
  const batches = state.batches
    .filter(b => !sf || b.status === sf)
    .filter(b => !q || (b.recipe_name||'').toLowerCase().includes(q) || (b.finished_product_name||'').toLowerCase().includes(q))
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if (!batches.length) return `<tr><td colspan="9"><div class="empty-state"><span class="material-icons">science</span><h3>No batches found</h3><p>Record your first production run.</p></div></td></tr>`;
  return batches.map(b => `
    <tr class="clickable" ondblclick="openBatchEdit('${b.id}')">
      <td class="font-medium">${escHtml(b.recipe_name || '—')}</td>
      <td class="text-muted">${escHtml(b.date || '—')}</td>
      <td class="font-mono text-muted">${batchAge(b.date)}</td>
      <td>${batchStatusBadge(b.status)}</td>
      <td class="font-mono text-muted">${b.scale != null ? b.scale + '×' : '1×'}</td>
      <td class="font-mono">${b.yield_quantity ?? '—'} ${escHtml(b.yield_unit||'')}</td>
      <td class="font-mono">${fmtCur(b.total_batch_cost)}</td>
      <td class="font-mono">${fmtCur(b.cost_per_unit)}</td>
      <td>
        <div class="actions">
          <button class="btn-icon" onclick="openBatchEdit('${b.id}')" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon danger" onclick="deleteBatch('${b.id}','${escHtml(b.recipe_name||'batch')}')" title="Delete"><span class="material-icons">delete</span></button>
        </div>
      </td>
    </tr>`).join('');
}

function renderBatches() {
  return `
    <div class="page-header">
      <div><div class="page-title">Batches</div><div class="page-sub">Production runs and actuals</div></div>
      <button class="btn btn-primary" onclick="openBatchAdd()"><span class="material-icons">add</span>New Batch</button>
    </div>
    <div class="card">
      <div class="table-toolbar">
        <div class="toolbar-filters">
          <select onchange="onBatchFilter(this.value)">
            <option value="">All statuses</option>
            <option value="in_progress" ${state.batchFilter==='in_progress'?'selected':''}>In Progress</option>
            <option value="curing"      ${state.batchFilter==='curing'?'selected':''}>Curing</option>
            <option value="complete"    ${state.batchFilter==='complete'?'selected':''}>Complete</option>
            <option value="failed"      ${state.batchFilter==='failed'?'selected':''}>Failed</option>
          </select>
        </div>
        <div class="toolbar-search">
          <span class="material-icons">search</span>
          <input type="text" placeholder="Search recipe or product…" value="${escHtml(state.batchSearch)}" oninput="onBatchSearch(this.value)">
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Recipe</th><th>Date</th><th>Age</th><th>Status</th><th>Scale</th><th>Yield</th>
            <th>Batch Cost</th><th>Cost / Unit</th><th></th>
          </tr></thead>
          <tbody id="batch-tbody">${batchRows()}</tbody>
        </table>
      </div>
    </div>`;
}

function setupBatchEvents() {}

window.onBatchSearch = function(q) {
  state.batchSearch = q;
  const el = document.getElementById('batch-tbody');
  if (el) el.innerHTML = batchRows();
};

window.onBatchFilter = function(v) {
  state.batchFilter = v;
  const el = document.getElementById('batch-tbody');
  if (el) el.innerHTML = batchRows();
};

window.openBatchAdd = function () {
  _ingredients = [];
  openModal('New Batch', batchForm(null), saveBatch, true);
  setupBatchFormSearch(null);
};

window.openBatchEdit = function (id) {
  const b = state.batches.find(x => x.id === id);
  if (!b) return;
  _ingredients = (b.ingredients || []).map(i => ({ ...i }));
  openModal('Edit Batch', batchForm(b), () => saveBatch(id), true);
  setupBatchFormSearch(b);
  if (!b.ingredients_locked) refreshIngredientRows('batch');
  updateCostSummary('batch');
};

function setupBatchFormSearch(b) {
  buildSearchSelect({
    containerId: 'ss-recipe',
    placeholder: 'Search recipes…',
    items: state.recipes.map(r => ({ id: r.id, label: r.name })),
    selectedId: b?.recipe_id || '',
    onSelect: id => applyRecipeToForm(id),
  });

  buildSearchSelect({
    containerId: 'ss-finished',
    placeholder: 'Optional — search finished products…',
    items: state.inventory.filter(i => i.type === 'finished_product').map(i => ({ id: i.id, label: i.name })),
    selectedId: b?.finished_product_id || '',
    onSelect: () => {},
  });
}

function applyRecipeToForm(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const scale = parseFloat(document.getElementById('f-scale')?.value) || 1;
  _ingredients = (recipe.ingredients || []).map(i => ({
    ...i,
    quantity:  +((i.quantity  || 0) * scale).toFixed(4),
    line_cost: +((i.quantity  || 0) * scale * (i.cost_per_unit || 0)).toFixed(4),
  }));
  const yieldUnit = document.getElementById('f-yield-unit');
  if (yieldUnit && recipe.yield_unit) yieldUnit.value = recipe.yield_unit;
  const yieldQty = document.getElementById('f-yield-qty');
  if (yieldQty && recipe.yield_quantity != null)
    yieldQty.value = +((recipe.yield_quantity * scale).toFixed(4));

  // Auto-populate finished product from recipe
  if (recipe.finished_product_id) {
    const fin = state.inventory.find(i => i.id === recipe.finished_product_id);
    const inp = document.querySelector('#ss-finished .ss-input');
    const hid = document.querySelector('#ss-finished .ss-value');
    if (inp) inp.value = fin?.name || '';
    if (hid) hid.value = recipe.finished_product_id;
  }

  refreshIngredientRows('batch');
  updateCostSummary('batch');
}

window.onBatchScaleChange = function () {
  const recipeId = document.querySelector('#ss-recipe .ss-value')?.value;
  if (recipeId) applyRecipeToForm(recipeId);
};

window.deleteBatch = async function (id, name) {
  if (!confirm(`Delete batch "${name}"?`)) return;
  try {
    await deleteDoc('batches', id);
    await reload('batches');
    toast('Batch deleted');
    navigate('batches');
  } catch (e) { toast('Delete failed', 'error'); }
};

function batchForm(b) {
  const d = b || {};
  return `
    <div class="form-row-3">
      <div class="form-group" style="grid-column:span 2">
        <label>Recipe</label>
        <div class="search-select" id="ss-recipe"></div>
      </div>
      <div class="form-group">
        <label>Scale</label>
        <input id="f-scale" type="number" min="0.25" step="0.25" value="${d.scale??1}" oninput="onBatchScaleChange()">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date</label>
        <input id="f-date" type="date" value="${escHtml(d.date || new Date().toISOString().slice(0,10))}">
        ${d.date ? `<div class="form-hint">Age: ${batchAge(d.date)}</div>` : ''}
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          <option value="in_progress" ${d.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="curing"      ${d.status==='curing'?'selected':''}>Curing</option>
          <option value="complete"    ${d.status==='complete'?'selected':''}>Complete</option>
          <option value="failed"      ${d.status==='failed'?'selected':''}>Failed</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Yield Quantity</label>
        <input id="f-yield-qty" type="number" min="0" step="any" value="${d.yield_quantity??''}" oninput="updateCostSummary('batch')">
      </div>
      <div class="form-group">
        <label>Yield Unit</label>
        ${unitSelect('f-yield-unit', d.yield_unit||'')}
      </div>
    </div>
    <div class="form-group">
      <label>Finished Product (Inventory Item)</label>
      <div class="search-select" id="ss-finished"></div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="f-notes">${escHtml(d.notes||'')}</textarea>
    </div>
    <div class="divider"></div>
    ${d.ingredients_locked ? `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <label style="margin:0">Actual Ingredients Used</label>
      <span class="badge badge-amber" style="display:inline-flex;align-items:center;gap:3px">
        <span class="material-icons" style="font-size:13px">lock</span>Locked
      </span>
    </div>
    <div class="table-wrap" style="border:1px solid var(--border);border-radius:8px">
      <table>
        <thead><tr><th style="width:32px"></th><th>Item</th><th>Qty</th><th>Unit</th><th style="text-align:right">Line Cost</th></tr></thead>
        <tbody>
          ${(d.ingredients||[]).map((ing, idx) => `
            <tr id="locked-ing-${idx}">
              <td><input type="checkbox" onchange="document.getElementById('locked-ing-${idx}').classList.toggle('ingredient-done',this.checked)"></td>
              <td>${escHtml(ing.name||'')}</td>
              <td class="font-mono">${ing.quantity ?? ''}</td>
              <td>${escHtml(ing.unit||'')}</td>
              <td class="font-mono" style="text-align:right">${fmtCur(ing.line_cost)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="cost-summary" style="margin-top:16px">
      <div class="cost-row"><span>Total Batch Cost</span><span id="cs-batch">${fmtCur(d.total_batch_cost)}</span></div>
      <div class="cost-row total"><span>Cost per Unit</span>
        <span id="cs-unit">${(d.yield_quantity||0) > 0 ? fmtCur((d.total_batch_cost||0) / d.yield_quantity) : '—'}</span>
      </div>
    </div>` : `
    <label>Actual Ingredients Used</label>
    <div class="ingredient-section">
      <div class="ingredient-header">
        <span></span><span>Item</span><span>Qty</span><span>Unit</span><span style="text-align:right">Line Cost</span><span></span>
      </div>
      <div id="ingredient-rows"></div>
      <button type="button" class="add-ingredient-btn" onclick="addIngredientRow('batch')">
        <span class="material-icons" style="font-size:15px">add</span> Add Ingredient
      </button>
    </div>
    <div id="cost-summary" class="cost-summary" style="margin-top:16px">
      <div class="cost-row"><span>Total Batch Cost</span><span id="cs-batch">$0.00</span></div>
      <div class="cost-row total"><span>Cost per Unit</span><span id="cs-unit">$0.00</span></div>
    </div>`}`;
}


async function saveBatch(id) {
  const recipeId   = document.querySelector('#ss-recipe .ss-value')?.value   || '';
  const finishedId = document.querySelector('#ss-finished .ss-value')?.value || '';
  const newStatus  = val('f-status');
  const oldBatch   = id ? state.batches.find(x => x.id === id) : null;
  const oldStatus  = oldBatch?.status || 'in_progress';
  const wasLocked  = oldBatch?.ingredients_locked || false;

  let ingredients;
  if (wasLocked) {
    ingredients = oldBatch.ingredients || [];
  } else {
    collectIngredientInputs();
    ingredients = _ingredients;
  }

  const scale          = parseFloat(val('f-scale')) || 1;
  const yieldQty       = numVal('f-yield-qty');
  const yieldUnit      = val('f-yield-unit').trim();
  const totalCost          = ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);
  const wipCostPerUnit     = scale > 0    ? totalCost / scale    : 0;
  const finishedCostPerUnit = yieldQty > 0 ? totalCost / yieldQty : 0;

  const recipe       = state.recipes.find(r => r.id === recipeId);
  const finishedItem = state.inventory.find(i => i.id === finishedId);
  const wipId        = recipe?.wip_product_id || oldBatch?.wip_product_id || '';
  const wipItem      = wipId ? state.inventory.find(i => i.id === wipId) : null;

  const data = {
    recipe_id:               recipeId,
    recipe_name:             recipe?.name || document.querySelector('#ss-recipe .ss-input')?.value || '',
    scale,
    date:                    val('f-date'),
    status:                  newStatus,
    notes:                   val('f-notes').trim(),
    yield_quantity:          yieldQty,
    yield_unit:              yieldUnit,
    ingredients,
    total_batch_cost:        +totalCost.toFixed(4),
    cost_per_unit:           yieldQty > 0 ? +(totalCost / yieldQty).toFixed(4) : 0,
    finished_product_id:     finishedId,
    finished_product_name:   finishedItem?.name || '',
    wip_product_id:          wipId,
    wip_product_name:        wipItem?.name || '',
    wip_quantity:            scale,
    wip_unit:                'batch',
    wip_cost_per_unit:       +wipCostPerUnit.toFixed(4),
    finished_cost_per_unit:  +finishedCostPerUnit.toFixed(4),
    ingredients_locked:      newStatus === 'curing' || newStatus === 'complete',
  };

  try {
    const now = new Date().toISOString();
    let batchId = id;
    if (id) { await updateDoc('batches', id, data); }
    else    { batchId = await addDoc('batches', data); }

    let inventoryChanged = false;

    // ── in_progress → curing: deduct raw mats, add WIP ──────
    if (oldStatus === 'in_progress' && newStatus === 'curing') {
      await deductBatchIngredients(ingredients, batchId, now);
      if (wipItem) await recordItemTransaction('addition', wipId, wipItem.name, wipItem.unit || 'batch', scale, wipCostPerUnit, 'wip – batch curing', batchId, now);
      inventoryChanged = true;
    }

    // ── curing → complete: deduct WIP, add finished ──────────
    if (oldStatus === 'curing' && newStatus === 'complete') {
      const storedWipQty  = oldBatch.wip_quantity      || scale;
      const storedWipCpu  = oldBatch.wip_cost_per_unit  || wipCostPerUnit;
      const storedWipUnit = oldBatch.wip_unit           || 'batch';
      const finCpu        = oldBatch.finished_cost_per_unit || finishedCostPerUnit;
      if (wipItem)      await recordItemTransaction('deduction', wipId,      wipItem.name,      wipItem.unit      || storedWipUnit, storedWipQty, storedWipCpu, 'wip → finished',      batchId, now);
      if (finishedItem) await recordItemTransaction('addition',  finishedId, finishedItem.name, finishedItem.unit || yieldUnit,     yieldQty,     finCpu,       'production complete', batchId, now);
      inventoryChanged = true;
    }

    // ── in_progress → complete (skip curing): deduct raw mats, add finished ──
    if (oldStatus === 'in_progress' && newStatus === 'complete') {
      await deductBatchIngredients(ingredients, batchId, now);
      if (finishedItem) await recordItemTransaction('addition', finishedId, finishedItem.name, finishedItem.unit || yieldUnit, yieldQty, finishedCostPerUnit, 'production complete', batchId, now);
      inventoryChanged = true;
    }

    // ── curing → in_progress: add raw mats back, deduct WIP ─
    if (oldStatus === 'curing' && newStatus === 'in_progress') {
      await reverseBatchIngredients(oldBatch.ingredients || [], batchId, now);
      const storedQty  = oldBatch.wip_quantity     || yieldQty;
      const storedCpu  = oldBatch.wip_cost_per_unit || wipCostPerUnit;
      const storedUnit = oldBatch.wip_unit          || yieldUnit;
      if (wipItem) await recordItemTransaction('deduction', wipId, wipItem.name, wipItem.unit || storedUnit, storedQty, storedCpu, 'reversal – uncured', batchId, now);
      inventoryChanged = true;
    }

    // ── complete → curing: deduct finished, add WIP back ────
    if (oldStatus === 'complete' && newStatus === 'curing') {
      const storedWipQty  = oldBatch.wip_quantity      || scale;
      const storedWipCpu  = oldBatch.wip_cost_per_unit  || wipCostPerUnit;
      const storedWipUnit = oldBatch.wip_unit           || 'batch';
      const prevFinQty    = oldBatch.yield_quantity     || yieldQty;
      const prevFinCpu    = oldBatch.finished_cost_per_unit || finishedCostPerUnit;
      const prevFinId     = oldBatch.finished_product_id || finishedId;
      const prevFinItem   = state.inventory.find(i => i.id === prevFinId);
      if (prevFinItem) await recordItemTransaction('deduction', prevFinId, prevFinItem.name, prevFinItem.unit || yieldUnit,     prevFinQty,    prevFinCpu,   'reversal – uncomplete',    batchId, now);
      if (wipItem)     await recordItemTransaction('addition',  wipId,     wipItem.name,     wipItem.unit     || storedWipUnit, storedWipQty,  storedWipCpu, 'reversal – back to curing', batchId, now);
      inventoryChanged = true;
    }

    await Promise.all([
      reload('batches'),
      ...(inventoryChanged ? [reload('inventory_items'), reload('inventory_transactions')] : []),
    ]);
    toast(id ? 'Batch updated' : 'Batch recorded');
    closeModal();
    navigate('batches');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── TRANSACTIONS ────────────────────────────────────────────
function txRows() {
  const f = state.txFilter;
  const q = state.txSearch.toLowerCase();
  const txns = state.transactions
    .filter(t => f === 'all' || t.type === f)
    .filter(t => !q || (t.item_name||'').toLowerCase().includes(q) || (t.reason||'').toLowerCase().includes(q))
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if (!txns.length) return `<tr><td colspan="7"><div class="empty-state"><span class="material-icons">receipt_long</span><h3>No transactions</h3><p>Inventory movements will appear here.</p></div></td></tr>`;
  return txns.map(t => `
    <tr>
      <td class="text-muted">${escHtml(t.date || '—')}</td>
      <td>${txTypeBadge(t.type)}</td>
      <td class="font-medium">${escHtml(t.item_name || '—')}</td>
      <td class="font-mono">${t.quantity ?? '—'} ${escHtml(t.unit||'')}</td>
      <td class="font-mono">${fmtCur(t.cost_per_unit)}</td>
      <td class="font-mono font-medium">${fmtCur(t.total_cost)}</td>
      <td class="text-muted">${escHtml(t.reason || '—')}</td>
    </tr>`).join('');
}

function renderTransactions() {
  const f = state.txFilter;
  return `
    <div class="page-header">
      <div><div class="page-title">Transactions</div><div class="page-sub">Inventory movement audit log</div></div>
      <button class="btn btn-primary" onclick="openTransactionAdd()"><span class="material-icons">add</span>Record Movement</button>
    </div>
    <div class="tabs" id="tx-tabs">
      <button class="tab ${f==='all'?'active':''}" data-filter="all">All (${state.transactions.length})</button>
      <button class="tab ${f==='addition'?'active':''}" data-filter="addition">Additions</button>
      <button class="tab ${f==='deduction'?'active':''}" data-filter="deduction">Deductions</button>
    </div>
    <div class="card">
      <div class="table-toolbar">
        <div class="toolbar-filters"></div>
        <div class="toolbar-search">
          <span class="material-icons">search</span>
          <input type="text" placeholder="Search item or reason…" value="${escHtml(state.txSearch)}" oninput="onTxSearch(this.value)">
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Type</th><th>Item</th><th>Quantity</th>
            <th>Cost/Unit</th><th>Total Cost</th><th>Reason</th>
          </tr></thead>
          <tbody id="tx-tbody">${txRows()}</tbody>
        </table>
      </div>
    </div>`;
}

function setupTransactionEvents() {
  document.getElementById('tx-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.txFilter = tab.dataset.filter;
    navigate('transactions');
  });
}

window.onTxSearch = function(q) {
  state.txSearch = q;
  const el = document.getElementById('tx-tbody');
  if (el) el.innerHTML = txRows();
};

window.openTransactionAdd = function () {
  openModal('Record Inventory Movement', transactionForm(), saveTransaction);
};

function transactionForm() {
  return `
    <div class="form-row">
      <div class="form-group">
        <label>Type</label>
        <select id="f-type">
          <option value="addition">Addition (stock in)</option>
          <option value="deduction">Deduction (stock out)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="f-date" type="datetime-local" value="${new Date().toISOString().slice(0,16)}">
      </div>
    </div>
    <div class="form-group">
      <label>Inventory Item</label>
      <select id="f-item" onchange="onTxItemSelect(this)">
        <option value="">— Select item —</option>
        ${state.inventory.map(i =>
          `<option value="${i.id}" data-unit="${escHtml(i.unit||'')}" data-cost="${i.cost_per_unit||0}" data-name="${escHtml(i.name)}">${escHtml(i.name)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Quantity</label>
        <input id="f-qty" type="number" min="0" step="any" oninput="updateTxCost()">
      </div>
      <div class="form-group">
        <label>Unit</label>
        ${unitSelect('f-unit', '')}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Cost per Unit ($)</label>
        <input id="f-cost" type="number" min="0" step="any" oninput="updateTxCost()">
      </div>
      <div class="form-group">
        <label>Total Cost</label>
        <input id="f-total" type="text" readonly>
      </div>
    </div>
    <div class="form-group">
      <label>Reason</label>
      <input id="f-reason" type="text" placeholder="e.g. purchase, production, adjustment">
    </div>
    <div class="form-group">
      <label>Batch ID (optional)</label>
      <input id="f-batch" type="text" placeholder="Link to a batch record">
    </div>`;
}

window.onTxItemSelect = function (sel) {
  const opt = sel.options[sel.selectedIndex];
  const unitEl = document.getElementById('f-unit');
  const costEl = document.getElementById('f-cost');
  if (unitEl) unitEl.value = opt.dataset.unit || '';
  if (costEl) costEl.value = opt.dataset.cost || '';
  updateTxCost();
};

window.updateTxCost = function () {
  const qty = parseFloat(val('f-qty')) || 0;
  const cost = parseFloat(val('f-cost')) || 0;
  const total = document.getElementById('f-total');
  if (total) total.value = `$${(qty * cost).toFixed(2)}`;
};

async function saveTransaction() {
  const itemEl = document.getElementById('f-item');
  const opt = itemEl?.options[itemEl.selectedIndex];
  const qty = numVal('f-qty');
  if (!itemEl?.value) { toast('Select an item', 'error'); return; }
  if (!qty) { toast('Enter a quantity', 'error'); return; }
  const costPerUnit = numVal('f-cost');
  const data = {
    type:          val('f-type'),
    item_id:       itemEl.value,
    item_name:     opt?.dataset?.name || '',
    quantity:      qty,
    unit:          val('f-unit'),
    cost_per_unit: costPerUnit,
    total_cost:    +(qty * costPerUnit).toFixed(4),
    reason:        val('f-reason').trim(),
    batch_id:      val('f-batch').trim(),
    date:          new Date(val('f-date')).toISOString(),
  };
  try {
    await addDoc('inventory_transactions', data);
    if (data.type === 'addition') {
      await adjustStock(itemEl.value, qty);
      if (costPerUnit > 0) {
        await updateDoc('inventory_items', itemEl.value, { cost_per_unit: costPerUnit });
      }
    }
    await reload('inventory_items');
    await reload('inventory_transactions');
    toast('Transaction recorded');
    closeModal();
    navigate('transactions');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── INGREDIENT ROW LOGIC ────────────────────────────────────
function refreshIngredientRows(context) {
  const container = document.getElementById('ingredient-rows');
  if (!container) return;

  const rawMats = state.inventory.filter(i => i.type === 'raw_material');

  const isBatch = context === 'batch';
  container.innerHTML = _ingredients.map((ing, idx) => `
    <div class="ingredient-row" id="ing-row-${idx}">
      ${isBatch ? `<input type="checkbox" onchange="document.getElementById('ing-row-${idx}').classList.toggle('ingredient-done',this.checked)">` : '<span></span>'}
      <div class="search-select" id="ss-ing-${idx}"></div>
      <input type="number" min="0" step="any" value="${ing.quantity||''}" placeholder="Qty"
             oninput="_ingredients[${idx}].quantity=parseFloat(this.value)||0;updateIngredientCost(${idx},'${context}')">
      <input type="text" value="${escHtml(ing.production_unit||ing.unit||'')}" readonly placeholder="unit">
      <span class="row-cost">${ing.line_cost ? '$'+ing.line_cost.toFixed(2) : '—'}</span>
      <button type="button" class="btn-icon danger" onclick="removeIngredientRow(${idx},'${context}')">
        <span class="material-icons">close</span>
      </button>
    </div>`).join('');

  _ingredients.forEach((ing, idx) => {
    buildSearchSelect({
      containerId: `ss-ing-${idx}`,
      placeholder: 'Search items…',
      items: rawMats.map(i => ({ id: i.id, label: i.name })),
      selectedId: ing.item_id || '',
      onSelect: id => {
        const item = rawMats.find(i => i.id === id);
        if (!item) return;
        const prodUnit = item.production_unit || item.unit || '';
        _ingredients[idx].item_id         = id;
        _ingredients[idx].name            = item.name;
        _ingredients[idx].unit            = prodUnit;
        _ingredients[idx].production_unit = prodUnit;
        _ingredients[idx].cost_per_unit   = item.cost_per_unit / (item.conversion_factor || 1);
        const row = document.getElementById(`ss-ing-${idx}`)?.closest('.ingredient-row');
        if (row) {
          const unitInput = row.querySelector('input[readonly]');
          if (unitInput) unitInput.value = prodUnit;
        }
        updateIngredientCost(idx, context);
      },
    });
  });

  updateCostSummary(context);
}

window.addIngredientRow = function (context) {
  _ingredients.push({ item_id: '', name: '', quantity: 0, unit: '', cost_per_unit: 0, line_cost: 0 });
  refreshIngredientRows(context);
};

window.removeIngredientRow = function (idx, context) {
  _ingredients.splice(idx, 1);
  refreshIngredientRows(context);
};


function updateIngredientCost(idx, context) {
  const ing = _ingredients[idx];
  ing.line_cost = +((ing.quantity || 0) * (ing.cost_per_unit || 0)).toFixed(4);
  const span = document.querySelectorAll('.row-cost')[idx];
  if (span) span.textContent = ing.line_cost ? `$${ing.line_cost.toFixed(2)}` : '—';
  updateCostSummary(context || (document.getElementById('f-yield-qty') ? 'recipe' : 'batch'));
}

window.updateCostSummary = function (context) {
  const total = _ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);
  const qty = parseFloat(document.getElementById('f-yield-qty')?.value) || 0;
  const batchEl = document.getElementById('cs-batch');
  const unitEl  = document.getElementById('cs-unit');
  if (batchEl) batchEl.textContent = `$${total.toFixed(2)}`;
  if (unitEl)  unitEl.textContent  = qty > 0 ? `$${(total / qty).toFixed(4)}` : '—';
};

function collectIngredientInputs() {
  // Reads current DOM values into _ingredients (catches any unsaved typing)
  document.querySelectorAll('.ingredient-row').forEach((row, idx) => {
    if (!_ingredients[idx]) return;
    const qtyInput = row.querySelector('input[type="number"]');
    if (qtyInput) {
      _ingredients[idx].quantity = parseFloat(qtyInput.value) || 0;
      _ingredients[idx].line_cost = +(_ingredients[idx].quantity * (_ingredients[idx].cost_per_unit || 0)).toFixed(4);
    }
  });
}

// ─── HELP ────────────────────────────────────────────────────
const HELP_DOCS = [
  { slug: 'getting-started', label: 'Getting Started',  icon: 'rocket_launch' },
  { slug: 'dashboard',       label: 'Dashboard',        icon: 'dashboard' },
  { slug: 'inventory',       label: 'Inventory',        icon: 'inventory_2' },
  { slug: 'recipes',         label: 'Recipes',          icon: 'menu_book' },
  { slug: 'batches',         label: 'Batches',          icon: 'science' },
  { slug: 'transactions',    label: 'Transactions',     icon: 'receipt_long' },
];

function renderHelp() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Help</div>
        <div class="page-sub">User guide and documentation</div>
      </div>
    </div>
    <div class="help-layout">
      <nav class="help-nav card">
        ${HELP_DOCS.map(d => `
          <a class="help-nav-item" data-slug="${escHtml(d.slug)}" onclick="loadHelpDoc('${escHtml(d.slug)}')">
            <span class="material-icons">${escHtml(d.icon)}</span>${escHtml(d.label)}
          </a>`).join('')}
      </nav>
      <div class="help-content card" id="help-content">
        <div class="loading-screen"><span class="material-icons spin">refresh</span></div>
      </div>
    </div>`;
}

function setupHelpEvents() {
  loadHelpDoc('getting-started');
}

window.loadHelpDoc = async function(slug) {
  document.querySelectorAll('.help-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.slug === slug));
  const content = document.getElementById('help-content');
  if (!content) return;
  content.innerHTML = `<div class="loading-screen"><span class="material-icons spin">refresh</span></div>`;
  try {
    const res = await fetch(`docs/${slug}.md`);
    if (!res.ok) throw new Error('not found');
    const text = await res.text();
    content.innerHTML = `<div class="help-body">${marked.parse(text)}</div>`;
    content.scrollTop = 0;
  } catch {
    content.innerHTML = `<p class="text-muted" style="padding:24px">Could not load documentation.</p>`;
  }
};
