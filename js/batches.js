import { state } from './state.js';
import { escHtml, fmtCur, batchStatusBadge, batchAge, unitSelect } from './helpers.js';
import { addDoc, updateDoc, deleteDoc, reload, deductBatchIngredients, reverseBatchIngredients, recordItemTransaction } from './db.js';
import { openModal, closeModal, toast, buildSearchSelect } from './ui.js';
import { navigate } from './nav.js';
import { getIngredients, setIngredients, refreshIngredientRows, updateCostSummary, collectIngredientInputs, sortIngredientsByCategory } from './ingredients.js';

function batchRows() {
  const q  = state.batchSearch.toLowerCase();
  const sf = state.batchFilter;
  const batches = state.batches
    .filter(b => !sf || b.status === sf)
    .filter(b => !q || (b.recipe_name||'').toLowerCase().includes(q) || (b.finished_product_name||'').toLowerCase().includes(q))
    .sort((a, b) => (b.date||'').localeCompare(a.date||''));
  if (!batches.length) return `<tr><td colspan="9"><div class="empty-state"><span class="material-icons">science</span><h3>No batches found</h3><p>Record your first production run.</p></div></td></tr>`;
  return batches.map(b => `
    <tr class="clickable" ondblclick="openBatchEdit('${b.id}')">
      <td class="font-medium card-title">${escHtml(b.recipe_name || '—')}</td>
      <td data-label="Date" class="text-muted">${escHtml(b.date || '—')}</td>
      <td data-label="Age" class="font-mono text-muted">${batchAge(b.date)}</td>
      <td data-label="Status">${batchStatusBadge(b.status)}</td>
      <td data-label="Scale" class="font-mono text-muted">${b.scale != null ? b.scale + '×' : '1×'}</td>
      <td data-label="Yield" class="font-mono">${b.yield_quantity ?? '—'} ${escHtml(b.yield_unit||'')}</td>
      <td data-label="Batch Cost" class="font-mono">${fmtCur(b.total_batch_cost)}</td>
      <td data-label="Cost / Unit" class="font-mono">${fmtCur(b.cost_per_unit)}</td>
      <td class="card-actions">
        <div class="actions">
          <button class="btn-icon" onclick="openBatchEdit('${b.id}')" title="Edit"><span class="material-icons">edit</span></button>
          <button class="btn-icon danger" onclick="deleteBatch('${b.id}','${escHtml(b.recipe_name||'batch')}')" title="Delete"><span class="material-icons">delete</span></button>
        </div>
      </td>
    </tr>`).join('');
}

export function renderBatches() {
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
            <option value="planned"      ${state.batchFilter==='planned'?'selected':''}>Planned</option>
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

export function setupBatchEvents() {}

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
    items: state.inventory.filter(i => i.type === 'finished_product' && i.active !== false).map(i => ({ id: i.id, label: i.name })),
    selectedId: b?.finished_product_id || '',
    onSelect: () => {},
  });
}

function applyRecipeToForm(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const scale = parseFloat(document.getElementById('f-scale')?.value) || 1;
  setIngredients((recipe.ingredients || []).map(i => ({
    ...i,
    quantity:  +((i.quantity  || 0) * scale).toFixed(4),
    line_cost: +((i.quantity  || 0) * scale * (i.cost_per_unit || 0)).toFixed(4),
  })));
  const yieldUnit = document.getElementById('f-yield-unit');
  if (yieldUnit && recipe.yield_unit) yieldUnit.value = recipe.yield_unit;
  const yieldQty = document.getElementById('f-yield-qty');
  if (yieldQty && recipe.yield_quantity != null)
    yieldQty.value = +((recipe.yield_quantity * scale).toFixed(4));
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
          <option value="planned"     ${d.status==='planned'||!d.status?'selected':''}>Planned</option>
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
          ${sortIngredientsByCategory(d.ingredients||[]).map((ing, idx) => {
            const isInactive = ing.item_id && state.inventory.find(i => i.id === ing.item_id)?.active === false;
            return `
            <tr id="locked-ing-${idx}"${isInactive ? ' class="ingredient-inactive"' : ''}>
              <td><input type="checkbox" onchange="document.getElementById('locked-ing-${idx}').classList.toggle('ingredient-done',this.checked)"></td>
              <td>${escHtml(ing.name||'')}${isInactive ? '<span class="material-icons ing-inactive-icon" title="Ingredient is inactive">warning</span>' : ''}</td>
              <td class="font-mono">${ing.quantity ?? ''}</td>
              <td>${escHtml(ing.unit||'')}</td>
              <td class="font-mono" style="text-align:right">${fmtCur(ing.line_cost)}</td>
            </tr>`;
          }).join('')}
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
  const newStatus  = document.getElementById('f-status')?.value;
  const oldBatch   = id ? state.batches.find(x => x.id === id) : null;
  const oldStatus  = oldBatch?.status || 'planned';
  const wasLocked  = oldBatch?.ingredients_locked || false;

  let ingredients;
  if (wasLocked) {
    ingredients = oldBatch.ingredients || [];
  } else {
    collectIngredientInputs();
    ingredients = getIngredients();
  }

  const scale               = parseFloat(document.getElementById('f-scale')?.value) || 1;
  const yieldQty            = parseFloat(document.getElementById('f-yield-qty')?.value) || 0;
  const yieldUnit           = document.getElementById('f-yield-unit')?.value.trim();
  const totalCost           = ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);
  const wipCostPerUnit      = scale > 0    ? totalCost / scale    : 0;
  const finishedCostPerUnit = yieldQty > 0 ? totalCost / yieldQty : 0;

  const recipe       = state.recipes.find(r => r.id === recipeId);
  const finishedItem = state.inventory.find(i => i.id === finishedId);
  const wipId        = recipe?.wip_product_id || oldBatch?.wip_product_id || '';
  const wipItem      = wipId ? state.inventory.find(i => i.id === wipId) : null;

  const data = {
    recipe_id:               recipeId,
    recipe_name:             recipe?.name || document.querySelector('#ss-recipe .ss-input')?.value || '',
    scale,
    date:                    document.getElementById('f-date')?.value,
    status:                  newStatus,
    notes:                   document.getElementById('f-notes')?.value.trim(),
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

    if ((oldStatus === 'planned' || oldStatus === 'in_progress') && newStatus === 'curing') {
      await deductBatchIngredients(ingredients, batchId, now);
      if (wipItem) await recordItemTransaction('addition', wipId, wipItem.name, wipItem.unit || 'batch', scale, wipCostPerUnit, 'wip – batch curing', batchId, now);
      inventoryChanged = true;
    }
    if (oldStatus === 'curing' && newStatus === 'complete') {
      const storedWipQty  = oldBatch.wip_quantity      || scale;
      const storedWipCpu  = oldBatch.wip_cost_per_unit  || wipCostPerUnit;
      const storedWipUnit = oldBatch.wip_unit           || 'batch';
      const finCpu        = oldBatch.finished_cost_per_unit || finishedCostPerUnit;
      if (wipItem)      await recordItemTransaction('deduction', wipId,      wipItem.name,      wipItem.unit      || storedWipUnit, storedWipQty, storedWipCpu, 'wip → finished',      batchId, now);
      if (finishedItem) await recordItemTransaction('addition',  finishedId, finishedItem.name, finishedItem.unit || yieldUnit,     yieldQty,     finCpu,       'production complete', batchId, now);
      inventoryChanged = true;
    }
    if ((oldStatus === 'planned' || oldStatus === 'in_progress') && newStatus === 'complete') {
      await deductBatchIngredients(ingredients, batchId, now);
      if (finishedItem) await recordItemTransaction('addition', finishedId, finishedItem.name, finishedItem.unit || yieldUnit, yieldQty, finishedCostPerUnit, 'production complete', batchId, now);
      inventoryChanged = true;
    }
    if (oldStatus === 'curing' && newStatus === 'in_progress') {
      await reverseBatchIngredients(oldBatch.ingredients || [], batchId, now);
      const storedQty  = oldBatch.wip_quantity     || yieldQty;
      const storedCpu  = oldBatch.wip_cost_per_unit || wipCostPerUnit;
      const storedUnit = oldBatch.wip_unit          || yieldUnit;
      if (wipItem) await recordItemTransaction('deduction', wipId, wipItem.name, wipItem.unit || storedUnit, storedQty, storedCpu, 'reversal – uncured', batchId, now);
      inventoryChanged = true;
    }
    if (oldStatus === 'complete' && newStatus === 'curing') {
      const storedWipQty  = oldBatch.wip_quantity      || scale;
      const storedWipCpu  = oldBatch.wip_cost_per_unit  || wipCostPerUnit;
      const storedWipUnit = oldBatch.wip_unit           || 'batch';
      const prevFinQty    = oldBatch.yield_quantity     || yieldQty;
      const prevFinCpu    = oldBatch.finished_cost_per_unit || finishedCostPerUnit;
      const prevFinId     = oldBatch.finished_product_id || finishedId;
      const prevFinItem   = state.inventory.find(i => i.id === prevFinId);
      if (prevFinItem) await recordItemTransaction('deduction', prevFinId, prevFinItem.name, prevFinItem.unit || yieldUnit,     prevFinQty,   prevFinCpu,   'reversal – uncomplete',    batchId, now);
      if (wipItem)     await recordItemTransaction('addition',  wipId,     wipItem.name,     wipItem.unit     || storedWipUnit, storedWipQty, storedWipCpu, 'reversal – back to curing', batchId, now);
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

// ─── WINDOW HANDLERS ─────────────────────────────────────────
window.onBatchSearch = function (q) {
  state.batchSearch = q;
  const el = document.getElementById('batch-tbody');
  if (el) el.innerHTML = batchRows();
};

window.onBatchFilter = function (v) {
  state.batchFilter = v;
  const el = document.getElementById('batch-tbody');
  if (el) el.innerHTML = batchRows();
};

window.openBatchAdd = function () {
  setIngredients([]);
  openModal('New Batch', batchForm(null), saveBatch, true);
  setupBatchFormSearch(null);
};

window.openBatchEdit = function (id) {
  const b = state.batches.find(x => x.id === id);
  if (!b) return;
  setIngredients((b.ingredients || []).map(i => ({ ...i })));
  openModal('Edit Batch', batchForm(b), () => saveBatch(id), true);
  setupBatchFormSearch(b);
  if (!b.ingredients_locked) refreshIngredientRows('batch');
  updateCostSummary('batch');
};

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
