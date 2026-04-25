/* ============================================================
   ONS Make — Soap & Cosmetics Business Manager
   ============================================================ */

'use strict';

// ─── STATE ──────────────────────────────────────────────────
const state = {
  inventory:    [],
  recipes:      [],
  batches:      [],
  transactions: [],
  view: 'dashboard',
  invFilter: 'all',
  txFilter:  'all',
};

let db;
let _ingredients = []; // active ingredient rows in open form

// ─── INIT ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  db = firebase.firestore();
  setupNav();
  setupModal();
  await loadAll();
  navigate('dashboard');
});

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
    await adjustStock(ing.item_id, ing.quantity);
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
  };
  main.innerHTML = renders[view]();
  const setups = {
    inventory:    setupInventoryEvents,
    recipes:      setupRecipeEvents,
    batches:      setupBatchEvents,
    transactions: setupTransactionEvents,
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
  return type === 'raw_material'
    ? `<span class="badge badge-blue">Raw Material</span>`
    : `<span class="badge badge-green">Finished</span>`;
}

function txTypeBadge(type) {
  return type === 'addition'
    ? `<span class="badge badge-green">Addition</span>`
    : `<span class="badge badge-red">Deduction</span>`;
}

// ─── DASHBOARD ──────────────────────────────────────────────
function renderDashboard() {
  const raw      = state.inventory.filter(i => i.type === 'raw_material');
  const finished = state.inventory.filter(i => i.type === 'finished_product');
  const lowStock = state.inventory.filter(i => (i.stock_on_hand ?? 0) <= (i.reorder_threshold ?? 0));
  const active   = state.batches.filter(b => b.status === 'in_progress' || b.status === 'curing');
  const recent   = [...state.batches].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

  const lowStockRows = lowStock.length
    ? lowStock.map(i => `
        <tr>
          <td class="font-medium">${escHtml(i.name)}</td>
          <td>${typeBadge(i.type)}</td>
          <td class="low-stock font-mono">${i.stock_on_hand ?? 0} ${escHtml(i.unit || '')}</td>
          <td class="text-muted font-mono">${i.reorder_threshold ?? 0} ${escHtml(i.unit || '')}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="text-center text-muted" style="padding:24px">All stock levels are healthy</td></tr>`;

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
          <div class="stat-value">${raw.length}</div>
        </div>
        <div class="stat-icon blue"><span class="material-icons">science</span></div>
      </div>
      <div class="card stat-card">
        <div>
          <div class="stat-label">Finished Products</div>
          <div class="stat-value">${finished.length}</div>
        </div>
        <div class="stat-icon green"><span class="material-icons">inventory_2</span></div>
      </div>
      <div class="card stat-card">
        <div>
          <div class="stat-label">Low Stock Items</div>
          <div class="stat-value" style="color:${lowStock.length ? 'var(--danger)' : 'inherit'}">${lowStock.length}</div>
        </div>
        <div class="stat-icon amber"><span class="material-icons">warning</span></div>
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
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Item</th><th>Type</th><th>On Hand</th><th>Reorder At</th>
          </tr></thead>
          <tbody>${lowStockRows}</tbody>
        </table>
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
function renderInventory() {
  const f = state.invFilter;
  const items = state.inventory
    .filter(i => f === 'all' || i.type === f)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const rows = items.length
    ? items.map(i => `
        <tr>
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
              <button class="btn-icon" onclick="openInventoryEdit('${i.id}')" title="Edit">
                <span class="material-icons">edit</span>
              </button>
              <button class="btn-icon danger" onclick="deleteInventoryItem('${i.id}','${escHtml(i.name)}')" title="Delete">
                <span class="material-icons">delete</span>
              </button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="8"><div class="empty-state">
        <span class="material-icons">inventory_2</span>
        <h3>No items found</h3>
        <p>Add your first inventory item to get started.</p>
       </div></td></tr>`;

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
      <button class="tab ${f==='finished_product'?'active':''}" data-filter="finished_product">Finished Products</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Name</th><th>Type</th><th>Category</th><th>On Hand</th>
            <th>Reorder At</th><th>Cost</th><th>Supplier</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
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
        <select id="f-type">
          <option value="raw_material"    ${d.type==='raw_material'?'selected':''}>Raw Material</option>
          <option value="finished_product"${d.type==='finished_product'?'selected':''}>Finished Product</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category</label>
        <input id="f-category" type="text" value="${escHtml(d.category||'')}" placeholder="e.g. oil, chemical, soap">
      </div>
      <div class="form-group">
        <label>Purchase Unit</label>
        <input id="f-unit" type="text" value="${escHtml(d.unit||'')}" placeholder="e.g. gal, oz, lb">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Production Unit <span class="text-muted" style="font-weight:400">(used in recipes)</span></label>
        <input id="f-production-unit" type="text" value="${escHtml(d.production_unit||'')}" placeholder="e.g. g, ml — leave blank if same as purchase">
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
          date:          new Date().toISOString().slice(0, 10),
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
function renderRecipes() {
  const recipes = [...state.recipes].sort((a,b) => (a.name||'').localeCompare(b.name||''));

  if (!recipes.length) {
    return `
      <div class="page-header">
        <div><div class="page-title">Recipes</div><div class="page-sub">Product formulas and cost estimates</div></div>
        <button class="btn btn-primary" onclick="openRecipeAdd()"><span class="material-icons">add</span>New Recipe</button>
      </div>
      <div class="card"><div class="empty-state">
        <span class="material-icons">menu_book</span>
        <h3>No recipes yet</h3><p>Create your first recipe formula.</p>
      </div></div>`;
  }

  const cards = recipes.map(r => `
    <div class="card recipe-card" onclick="openRecipeEdit('${r.id}')">
      <div class="recipe-card-name">${escHtml(r.name)}</div>
      <div class="recipe-card-meta">
        ${escHtml(r.category || 'Uncategorized')} &nbsp;·&nbsp;
        ${(r.ingredients || []).length} ingredient${(r.ingredients||[]).length !== 1 ? 's' : ''}
      </div>
      <div class="recipe-card-footer">
        <div>
          <div class="recipe-stat-label">Yield</div>
          <div class="recipe-stat-value">${r.yield_quantity ?? '—'} ${escHtml(r.yield_unit||'')}</div>
        </div>
        <div>
          <div class="recipe-stat-label">Batch Cost</div>
          <div class="recipe-stat-value">${fmtCur(r.estimated_batch_cost)}</div>
        </div>
        <div>
          <div class="recipe-stat-label">Cost / Unit</div>
          <div class="recipe-stat-value">${fmtCur(r.estimated_cost_per_unit)}</div>
        </div>
      </div>
    </div>`).join('');

  return `
    <div class="page-header">
      <div><div class="page-title">Recipes</div><div class="page-sub">Product formulas and cost estimates</div></div>
      <button class="btn btn-primary" onclick="openRecipeAdd()"><span class="material-icons">add</span>New Recipe</button>
    </div>
    <div class="recipe-grid">${cards}</div>`;
}

function setupRecipeEvents() {}

window.openRecipeAdd = function () {
  _ingredients = [];
  openModal('New Recipe', recipeForm(null), saveRecipe, true);
};

window.openRecipeEdit = function (id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  _ingredients = (r.ingredients || []).map(ing => ({ ...ing }));
  openModal('Edit Recipe', recipeForm(r), () => saveRecipe(id), true);
  refreshIngredientRows('recipe');
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
    <div class="form-row">
      <div class="form-group">
        <label>Recipe Name</label>
        <input id="f-name" type="text" value="${escHtml(d.name||'')}" placeholder="e.g. Lavender Bar Soap">
      </div>
      <div class="form-group">
        <label>Category</label>
        <input id="f-category" type="text" value="${escHtml(d.category||'')}" placeholder="e.g. soap, lotion">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Yield Quantity</label>
        <input id="f-yield-qty" type="number" min="0" step="any" value="${d.yield_quantity??''}" oninput="updateCostSummary('recipe')">
      </div>
      <div class="form-group">
        <label>Yield Unit</label>
        <input id="f-yield-unit" type="text" value="${escHtml(d.yield_unit||'')}" placeholder="e.g. bars, bottles">
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
    ${r ? `<div style="margin-top:16px;text-align:right">
      <button class="btn btn-danger" onclick="deleteRecipe('${r.id}','${escHtml(r.name)}')">
        <span class="material-icons">delete</span>Delete Recipe
      </button>
    </div>` : ''}`;
}

async function saveRecipe(id) {
  const name = val('f-name').trim();
  if (!name) { toast('Name is required', 'error'); return; }
  collectIngredientInputs();
  const yieldQty = numVal('f-yield-qty');
  const totalCost = _ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);
  const data = {
    name,
    category:              val('f-category').trim(),
    yield_quantity:        yieldQty,
    yield_unit:            val('f-yield-unit').trim(),
    notes:                 val('f-notes').trim(),
    ingredients:           _ingredients,
    estimated_batch_cost:  +totalCost.toFixed(4),
    estimated_cost_per_unit: yieldQty > 0 ? +(totalCost / yieldQty).toFixed(4) : 0,
  };
  try {
    if (id) { await updateDoc('recipes', id, data); }
    else    { await addDoc('recipes', data); }
    await reload('recipes');
    toast(id ? 'Recipe updated' : 'Recipe created');
    closeModal();
    navigate('recipes');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── BATCHES ────────────────────────────────────────────────
function renderBatches() {
  const batches = [...state.batches].sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const rows = batches.length
    ? batches.map(b => `
        <tr>
          <td class="font-medium">${escHtml(b.recipe_name || '—')}</td>
          <td class="text-muted">${escHtml(b.date || '—')}</td>
          <td class="font-mono text-muted">${batchAge(b.date)}</td>
          <td>${batchStatusBadge(b.status)}</td>
          <td class="font-mono">${b.yield_quantity ?? '—'} ${escHtml(b.yield_unit||'')}</td>
          <td class="font-mono">${fmtCur(b.total_batch_cost)}</td>
          <td class="font-mono">${fmtCur(b.cost_per_unit)}</td>
          <td>
            <div class="actions">
              <button class="btn-icon" onclick="openBatchEdit('${b.id}')" title="Edit">
                <span class="material-icons">edit</span>
              </button>
              <button class="btn-icon danger" onclick="deleteBatch('${b.id}','${escHtml(b.recipe_name||'batch')}')" title="Delete">
                <span class="material-icons">delete</span>
              </button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">
        <span class="material-icons">science</span>
        <h3>No batches yet</h3><p>Record your first production run.</p>
       </div></td></tr>`;

  return `
    <div class="page-header">
      <div><div class="page-title">Batches</div><div class="page-sub">Production runs and actuals</div></div>
      <button class="btn btn-primary" onclick="openBatchAdd()"><span class="material-icons">add</span>New Batch</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Recipe</th><th>Date</th><th>Age</th><th>Status</th><th>Yield</th>
            <th>Batch Cost</th><th>Cost / Unit</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function setupBatchEvents() {}

window.openBatchAdd = function () {
  _ingredients = [];
  openModal('New Batch', batchForm(null), saveBatch, true);
};

window.openBatchEdit = function (id) {
  const b = state.batches.find(x => x.id === id);
  if (!b) return;
  _ingredients = (b.ingredients || []).map(i => ({ ...i }));
  openModal('Edit Batch', batchForm(b), () => saveBatch(id), true);
  if (!b.ingredients_locked) refreshIngredientRows('batch');
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
  const recipeOptions = state.recipes.map(r =>
    `<option value="${r.id}" data-name="${escHtml(r.name)}" ${d.recipe_id===r.id?'selected':''}>${escHtml(r.name)}</option>`
  ).join('');

  return `
    <div class="form-row">
      <div class="form-group">
        <label>Recipe</label>
        <select id="f-recipe" onchange="onRecipeSelect(this)">
          <option value="">— Select recipe —</option>
          ${recipeOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="f-date" type="date" value="${escHtml(d.date || new Date().toISOString().slice(0,10))}">
        ${d.date ? `<div class="form-hint">Age: ${batchAge(d.date)}</div>` : ''}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          <option value="in_progress" ${d.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="curing"      ${d.status==='curing'?'selected':''}>Curing</option>
          <option value="complete"    ${d.status==='complete'?'selected':''}>Complete</option>
          <option value="failed"      ${d.status==='failed'?'selected':''}>Failed</option>
        </select>
      </div>
      <div class="form-group">
        <label>Yield Quantity</label>
        <input id="f-yield-qty" type="number" min="0" step="any" value="${d.yield_quantity??''}" oninput="updateCostSummary('batch')">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Yield Unit</label>
        <input id="f-yield-unit" type="text" value="${escHtml(d.yield_unit||'')}" placeholder="e.g. bars">
      </div>
      <div class="form-group">
        <label>Finished Product (Inventory Item)</label>
        <select id="f-finished">
          <option value="">— Optional —</option>
          ${state.inventory.filter(i=>i.type==='finished_product').map(i=>
            `<option value="${i.id}" ${d.finished_product_id===i.id?'selected':''}>${escHtml(i.name)}</option>`
          ).join('')}
        </select>
      </div>
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
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th style="text-align:right">Line Cost</th></tr></thead>
        <tbody>
          ${(d.ingredients||[]).map(ing => `
            <tr>
              <td>${escHtml(ing.name||'')}</td>
              <td class="font-mono">${ing.quantity ?? ''}</td>
              <td>${escHtml(ing.unit||'')}</td>
              <td class="font-mono" style="text-align:right">${fmtCur(ing.line_cost)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="cost-summary" style="margin-top:16px">
      <div class="cost-row"><span>Total Batch Cost</span><span>${fmtCur(d.total_batch_cost)}</span></div>
      <div class="cost-row total"><span>Cost per Unit</span>
        <span>${(d.yield_quantity||0) > 0 ? fmtCur((d.total_batch_cost||0) / d.yield_quantity) : '—'}</span>
      </div>
    </div>` : `
    <label>Actual Ingredients Used</label>
    <div class="ingredient-section">
      <div class="ingredient-header">
        <span>Item</span><span>Qty</span><span>Unit</span><span style="text-align:right">Line Cost</span><span></span>
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

window.onRecipeSelect = function (sel) {
  const recipeId = sel.value;
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  _ingredients = (recipe.ingredients || []).map(i => ({ ...i }));
  const yieldUnit = document.getElementById('f-yield-unit');
  if (yieldUnit && recipe.yield_unit) yieldUnit.value = recipe.yield_unit;
  const yieldQty = document.getElementById('f-yield-qty');
  if (yieldQty && recipe.yield_quantity) yieldQty.value = recipe.yield_quantity;
  refreshIngredientRows('batch');
  updateCostSummary('batch');
};

async function saveBatch(id) {
  const recipeEl    = document.getElementById('f-recipe');
  const finishedEl  = document.getElementById('f-finished');
  const newStatus   = val('f-status');
  const oldBatch    = id ? state.batches.find(x => x.id === id) : null;
  const wasLocked   = oldBatch?.ingredients_locked || false;
  const lockingNow  = (newStatus === 'curing' || newStatus === 'complete') && !wasLocked;
  const unlockingNow= newStatus === 'in_progress' && wasLocked;

  // When locked, preserve server ingredients; otherwise collect from form
  let ingredients;
  if (wasLocked) {
    ingredients = oldBatch.ingredients || [];
  } else {
    collectIngredientInputs();
    ingredients = _ingredients;
  }

  const yieldQty    = numVal('f-yield-qty');
  const totalCost   = ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);
  const finishedItem= state.inventory.find(i => i.id === finishedEl?.value);
  const data = {
    recipe_id:               recipeEl?.value || '',
    recipe_name:             recipeEl?.options[recipeEl.selectedIndex]?.dataset?.name || recipeEl?.options[recipeEl.selectedIndex]?.text || '',
    date:                    val('f-date'),
    status:                  newStatus,
    notes:                   val('f-notes').trim(),
    yield_quantity:          yieldQty,
    yield_unit:              val('f-yield-unit').trim(),
    ingredients,
    total_batch_cost:        +totalCost.toFixed(4),
    cost_per_unit:           yieldQty > 0 ? +(totalCost / yieldQty).toFixed(4) : 0,
    finished_product_id:     finishedEl?.value || '',
    finished_product_name:   finishedItem?.name || '',
    finished_product_quantity: yieldQty,
    finished_product_unit:   val('f-yield-unit').trim(),
    ingredients_locked:      lockingNow ? true : (unlockingNow ? false : wasLocked),
  };
  try {
    const today = new Date().toISOString().slice(0, 10);
    let batchId = id;
    if (id) { await updateDoc('batches', id, data); }
    else    { batchId = await addDoc('batches', data); }

    if (lockingNow)   await deductBatchIngredients(ingredients, batchId, today);
    if (unlockingNow) await reverseBatchIngredients(ingredients, batchId, today);

    await Promise.all([
      reload('batches'),
      ...(lockingNow || unlockingNow ? [reload('inventory_items'), reload('inventory_transactions')] : []),
    ]);
    toast(id ? 'Batch updated' : 'Batch recorded');
    closeModal();
    navigate('batches');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── TRANSACTIONS ────────────────────────────────────────────
function renderTransactions() {
  const f = state.txFilter;
  const txns = [...state.transactions]
    .filter(t => f === 'all' || t.type === f)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const rows = txns.length
    ? txns.map(t => `
        <tr>
          <td class="text-muted">${escHtml(t.date || '—')}</td>
          <td>${txTypeBadge(t.type)}</td>
          <td class="font-medium">${escHtml(t.item_name || '—')}</td>
          <td class="font-mono">${t.quantity ?? '—'} ${escHtml(t.unit||'')}</td>
          <td class="font-mono">${fmtCur(t.cost_per_unit)}</td>
          <td class="font-mono font-medium">${fmtCur(t.total_cost)}</td>
          <td class="text-muted">${escHtml(t.reason || '—')}</td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state">
        <span class="material-icons">receipt_long</span>
        <h3>No transactions</h3><p>Inventory movements will appear here.</p>
       </div></td></tr>`;

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
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Type</th><th>Item</th><th>Quantity</th>
            <th>Cost/Unit</th><th>Total Cost</th><th>Reason</th>
          </tr></thead>
          <tbody>${rows}</tbody>
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
        <input id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}">
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
        <input id="f-unit" type="text" readonly>
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
    date:          val('f-date'),
  };
  try {
    await addDoc('inventory_transactions', data);
    if (data.type === 'addition') {
      await adjustStock(itemEl.value, qty);
      await reload('inventory_items');
    }
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

  container.innerHTML = _ingredients.map((ing, idx) => `
    <div class="ingredient-row">
      <select onchange="onIngredientItemSelect(${idx}, this)">
        <option value="">— Select item —</option>
        ${rawMats.map(i => {
          const prodUnit = i.production_unit || i.unit || '';
          const conv     = i.conversion_factor || 1;
          return `<option value="${i.id}"
            data-unit="${escHtml(i.unit||'')}"
            data-production-unit="${escHtml(prodUnit)}"
            data-cost="${i.cost_per_unit||0}"
            data-conversion="${conv}"
            ${ing.item_id===i.id?'selected':''}>${escHtml(i.name)}</option>`;
        }).join('')}
      </select>
      <input type="number" min="0" step="any" value="${ing.quantity||''}" placeholder="Qty"
             oninput="_ingredients[${idx}].quantity=parseFloat(this.value)||0;updateIngredientCost(${idx},'${context}')">
      <input type="text" value="${escHtml(ing.production_unit||ing.unit||'')}" readonly placeholder="unit">
      <span class="row-cost">${ing.line_cost ? '$'+ing.line_cost.toFixed(2) : '—'}</span>
      <button type="button" class="btn-icon danger" onclick="removeIngredientRow(${idx},'${context}')">
        <span class="material-icons">close</span>
      </button>
    </div>`).join('');

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

window.onIngredientItemSelect = function (idx, sel) {
  const opt          = sel.options[sel.selectedIndex];
  const purchaseCost = parseFloat(opt.dataset.cost)       || 0;
  const conversion   = parseFloat(opt.dataset.conversion) || 1;
  const prodUnit     = opt.dataset.productionUnit || opt.dataset.unit || '';
  _ingredients[idx].item_id         = sel.value;
  _ingredients[idx].name            = opt.text;
  _ingredients[idx].unit            = prodUnit;
  _ingredients[idx].production_unit = prodUnit;
  _ingredients[idx].cost_per_unit   = purchaseCost / conversion;
  updateIngredientCost(idx, null);
  refreshIngredientRows(document.getElementById('f-yield-qty') ? 'recipe' : 'batch');
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
