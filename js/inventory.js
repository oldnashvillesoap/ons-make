import { state, PRODUCT_CATEGORIES, RAW_MATERIAL_CATEGORIES } from './state.js';
import { escHtml, fmtCur, typeBadge, unitSelect } from './helpers.js';
import { addDoc, updateDoc, deleteDoc, reload } from './db.js';
import { openModal, closeModal, toast } from './ui.js';
import { navigate } from './nav.js';

// ─── ROWS ────────────────────────────────────────────────────
function invRows() {
  const f = state.invFilter;
  const q = state.invSearch.toLowerCase();
  const showInactive = state.invShowInactive;
  const items = state.inventory
    .filter(i => showInactive ? i.active === false : i.active !== false)
    .filter(i => f === 'all' || i.type === f)
    .filter(i => !q || (i.name||'').toLowerCase().includes(q) || (i.category||'').toLowerCase().includes(q) || (i.supplier||'').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!items.length) return `<tr><td colspan="8"><div class="empty-state"><span class="material-icons">inventory_2</span><h3>${showInactive ? 'No inactive items' : 'No items found'}</h3><p>${showInactive ? 'No deactivated materials.' : 'Add your first inventory item to get started.'}</p></div></td></tr>`;
  return items.map(i => `
    <tr class="clickable${i.active === false ? ' row-inactive' : ''}" ondblclick="${i.active === false ? '' : `openInventoryEdit('${i.id}')`}">
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
          ${i.active !== false ? `<button class="btn-icon" onclick="openInventoryEdit('${i.id}')" title="Edit"><span class="material-icons">edit</span></button>` : ''}
          <button class="btn-icon${i.active === false ? ' success' : ' warning'}" onclick="toggleInventoryActive('${i.id}',${i.active === false})" title="${i.active === false ? 'Reactivate' : 'Deactivate'}">
            <span class="material-icons">${i.active === false ? 'toggle_on' : 'toggle_off'}</span>
          </button>
          <button class="btn-icon danger" onclick="deleteInventoryItem('${i.id}','${escHtml(i.name)}')" title="Delete"><span class="material-icons">delete</span></button>
        </div>
      </td>
    </tr>`).join('');
}

// ─── RENDER ──────────────────────────────────────────────────
export function renderInventory() {
  const f = state.invFilter;
  const showInactive   = state.invShowInactive;
  const activeInv      = state.inventory.filter(i => i.active !== false);
  const inactiveCount  = state.inventory.filter(i => i.active === false).length;
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
      <button class="tab ${f==='all'?'active':''}" data-filter="all">All (${showInactive ? inactiveCount : activeInv.length})</button>
      <button class="tab ${f==='raw_material'?'active':''}" data-filter="raw_material">Raw Materials</button>
      <button class="tab ${f==='wip'?'active':''}" data-filter="wip">WIP</button>
      <button class="tab ${f==='finished_product'?'active':''}" data-filter="finished_product">Finished Products</button>
    </div>
    <div class="card">
      <div class="table-toolbar">
        <div class="toolbar-filters">
          <button class="btn btn-sm ${showInactive ? 'btn-warning' : 'btn-ghost'}" onclick="onInvToggleInactive()" title="${showInactive ? 'Showing inactive — click to show active' : 'Show inactive materials'}">
            <span class="material-icons" style="font-size:16px">${showInactive ? 'toggle_on' : 'toggle_off'}</span>
            ${showInactive ? `Inactive (${inactiveCount})` : `Show Inactive${inactiveCount ? ` (${inactiveCount})` : ''}`}
          </button>
        </div>
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

export function setupInventoryEvents() {
  document.getElementById('inv-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.invFilter = tab.dataset.filter;
    navigate('inventory');
  });
}

// ─── FORM ────────────────────────────────────────────────────
const VOLUME_CONVERSIONS = {
  'fl-oz': { Liquids: 29.57, 'Liquid oils': 27.21 },
  gal:     { Liquids: 3785.41, 'Liquid oils': 3482.58 },
};
const MASS_CONVERSIONS = { oz: 28.35, lb: 453.59 };

function conversionHintText(prodUnit, purchUnit) {
  if (prodUnit && purchUnit && prodUnit !== purchUnit) return `(${prodUnit} per ${purchUnit})`;
  return '(production ÷ purchase)';
}

function inventoryForm(item) {
  const d = item || {};
  const isInactive = d.active === false;
  return `
    ${isInactive ? `<div class="form-notice form-notice-warning"><span class="material-icons">block</span>This item is inactive and hidden from search and the dashboard.</div>` : ''}
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
        <select id="f-category" onchange="onConversionUnitsChange()">
          <option value="">— Select category —</option>
          ${((d.type === 'wip' || d.type === 'finished_product') ? PRODUCT_CATEGORIES : RAW_MATERIAL_CATEGORIES).map(c =>
            `<option value="${c}" ${d.category===c?'selected':''}>${c}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Purchase Unit</label>
        ${unitSelect('f-unit', d.unit||'', 'onchange="onConversionUnitsChange()"')}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Production Unit <span class="text-muted" style="font-weight:400">(used in recipes — leave blank if same as purchase)</span></label>
        ${unitSelect('f-production-unit', d.production_unit||'', 'onchange="onConversionUnitsChange()"')}
      </div>
      <div class="form-group">
        <label>Conversion <span id="conversion-hint" class="text-muted" style="font-weight:400">${conversionHintText(d.production_unit, d.unit)}</span></label>
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
    </div>
    `;
}

// ─── SAVE ────────────────────────────────────────────────────
async function saveInventoryItem(id) {
  const name = document.getElementById('f-name')?.value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const purchaseUnit     = document.getElementById('f-unit')?.value.trim();
  const productionUnit   = document.getElementById('f-production-unit')?.value.trim();
  const conversionFactor = parseFloat(document.getElementById('f-conversion')?.value) || 1;
  const data = {
    name,
    type:              document.getElementById('f-type')?.value,
    category:          document.getElementById('f-category')?.value.trim(),
    unit:              purchaseUnit,
    production_unit:   productionUnit || purchaseUnit,
    conversion_factor: conversionFactor,
    stock_on_hand:     parseFloat(document.getElementById('f-stock')?.value) || 0,
    reorder_threshold: parseFloat(document.getElementById('f-reorder')?.value) || 0,
    cost_per_unit:     parseFloat(document.getElementById('f-cost')?.value) || 0,
    currency:          'USD',
    supplier:          document.getElementById('f-supplier')?.value.trim(),
    notes:             document.getElementById('f-notes')?.value.trim(),
    active:            id ? (state.inventory.find(i => i.id === id)?.active ?? true) : true,
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

// ─── WINDOW HANDLERS ─────────────────────────────────────────
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

window.toggleInventoryActive = async function (id, makeActive) {
  try {
    await updateDoc('inventory_items', id, { active: makeActive });
    await reload('inventory_items');
    toast(makeActive ? 'Item reactivated' : 'Item deactivated');
    navigate('inventory');
  } catch (e) { toast('Update failed', 'error'); }
};

window.onInvSearch = function (q) {
  state.invSearch = q;
  const el = document.getElementById('inv-tbody');
  if (el) el.innerHTML = invRows();
};

window.onInvToggleInactive = function () {
  state.invShowInactive = !state.invShowInactive;
  navigate('inventory');
};

window.onInvTypeChange = function (type) {
  const sel = document.getElementById('f-category');
  if (!sel) return;
  const cats = type === 'raw_material' ? RAW_MATERIAL_CATEGORIES : PRODUCT_CATEGORIES;
  sel.innerHTML = `<option value="">— Select category —</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
  window.onConversionUnitsChange();
};

window.onConversionUnitsChange = function () {
  const purchUnit = document.getElementById('f-unit')?.value;
  const prodUnit  = document.getElementById('f-production-unit')?.value;
  const category  = document.getElementById('f-category')?.value;

  const hint = document.getElementById('conversion-hint');
  if (hint) hint.textContent = conversionHintText(prodUnit, purchUnit);

  if (!purchUnit || !prodUnit || prodUnit === purchUnit) return;
  const convInput = document.getElementById('f-conversion');
  if (!convInput) return;

  const key = `${prodUnit}/${purchUnit}`;
  let known;
  if (key === 'g/oz') known = MASS_CONVERSIONS.oz;
  else if (key === 'g/lb') known = MASS_CONVERSIONS.lb;
  else if (prodUnit === 'g' && VOLUME_CONVERSIONS[purchUnit]) {
    const table = VOLUME_CONVERSIONS[purchUnit];
    known = table[category] ?? table.Liquids;
  }
  if (known !== undefined) convInput.value = known;
};
