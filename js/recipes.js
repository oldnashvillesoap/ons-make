import { state, PRODUCT_CATEGORIES } from './state.js';
import { escHtml, fmtCur, unitSelect } from './helpers.js';
import { addDoc, updateDoc, deleteDoc, reload } from './db.js';
import { openModal, closeModal, toast, buildSearchSelect } from './ui.js';
import { navigate } from './nav.js';
import { getIngredients, setIngredients, refreshIngredientRows, updateCostSummary, collectIngredientInputs } from './ingredients.js';

function recipeRows() {
  const q  = state.recipeSearch.toLowerCase();
  const cf = state.recipeFilter;
  const recipes = state.recipes
    .filter(r => !cf || r.category === cf)
    .filter(r => !q || (r.name||'').toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q) || (r.finished_product_name||'').toLowerCase().includes(q))
    .sort((a, b) => (a.name||'').localeCompare(b.name||''));
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

export function renderRecipes() {
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

export function setupRecipeEvents() {}

function setupRecipeFormSearch(r) {
  if (document.getElementById('ss-copy-from')) {
    buildSearchSelect({
      containerId: 'ss-copy-from',
      placeholder: 'Search recipes…',
      items: state.recipes.map(x => ({ id: x.id, label: x.name })),
      selectedId: '',
      onSelect: id => window.onCopyFromRecipe(id),
    });
  }
  buildSearchSelect({
    containerId: 'ss-recipe-wip',
    placeholder: 'Search WIP products…',
    items: state.inventory.filter(i => i.type === 'wip' && i.active !== false).map(i => ({ id: i.id, label: i.name })),
    selectedId: r?.wip_product_id || '',
    onSelect: () => {},
  });
  buildSearchSelect({
    containerId: 'ss-recipe-finished',
    placeholder: 'Search finished products…',
    items: state.inventory.filter(i => i.type === 'finished_product' && i.active !== false).map(i => ({ id: i.id, label: i.name })),
    selectedId: r?.finished_product_id || '',
    onSelect: id => {
      const item = state.inventory.find(i => i.id === id);
      if (!item) return;
      const yieldUnit = document.getElementById('f-yield-unit');
      if (yieldUnit) yieldUnit.value = item.unit || '';
    },
  });
}

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
          ${PRODUCT_CATEGORIES.map(c => `<option value="${c}" ${d.category===c?'selected':''}>${c}</option>`).join('')}
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
  const name = document.getElementById('f-name')?.value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  collectIngredientInputs();
  const ingredients = getIngredients();
  const yieldQty    = parseFloat(document.getElementById('f-yield-qty')?.value) || 0;
  const yieldUnit   = document.getElementById('f-yield-unit')?.value.trim();
  const category    = document.getElementById('f-category')?.value.trim();
  const totalCost   = ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);

  let wipId      = document.querySelector('#ss-recipe-wip .ss-value')?.value      || '';
  let finishedId = document.querySelector('#ss-recipe-finished .ss-value')?.value || '';
  let wipName      = state.inventory.find(i => i.id === wipId)?.name      || '';
  let finishedName = state.inventory.find(i => i.id === finishedId)?.name || '';

  if (!id) {
    const baseItem = { stock_on_hand: 0, reorder_threshold: 0, cost_per_unit: 0, category };
    if (document.getElementById('chk-create-wip')?.checked && !wipId) {
      wipId   = await addDoc('inventory_items', { ...baseItem, name, type: 'wip', unit: 'batch', production_unit: 'batch', active: true });
      wipName = name;
    }
    if (document.getElementById('chk-create-finished')?.checked && !finishedId) {
      const unit = yieldUnit || 'each';
      finishedId   = await addDoc('inventory_items', { ...baseItem, name, type: 'finished_product', unit, production_unit: unit, active: true });
      finishedName = name;
    }
  }

  const data = {
    name, category,
    yield_quantity:          yieldQty,
    yield_unit:              yieldUnit,
    notes:                   document.getElementById('f-notes')?.value.trim(),
    ingredients,
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

// ─── WINDOW HANDLERS ─────────────────────────────────────────
window.onRecipeSearch = function (q) {
  state.recipeSearch = q;
  const el = document.getElementById('recipe-tbody');
  if (el) el.innerHTML = recipeRows();
};

window.onRecipeFilter = function (v) {
  state.recipeFilter = v;
  const el = document.getElementById('recipe-tbody');
  if (el) el.innerHTML = recipeRows();
};

window.openRecipeAdd = function () {
  setIngredients([]);
  openModal('New Recipe', recipeForm(null), saveRecipe, true);
  setupRecipeFormSearch(null);
};

window.openRecipeEdit = function (id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  setIngredients((r.ingredients || []).map(ing => ({ ...ing })));
  openModal('Edit Recipe', recipeForm(r), () => saveRecipe(id), true);
  setupRecipeFormSearch(r);
  refreshIngredientRows('recipe');
};

window.onCopyFromRecipe = function (recipeId) {
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
  setIngredients((source.ingredients || []).map(i => ({ ...i })));
  refreshIngredientRows('recipe');
  updateCostSummary('recipe');
  buildSearchSelect({
    containerId: 'ss-recipe-wip',
    placeholder: 'Search WIP products…',
    items: state.inventory.filter(i => i.type === 'wip' && i.active !== false).map(i => ({ id: i.id, label: i.name })),
    selectedId: source.wip_product_id || '',
    onSelect: () => {},
  });
  buildSearchSelect({
    containerId: 'ss-recipe-finished',
    placeholder: 'Search finished products…',
    items: state.inventory.filter(i => i.type === 'finished_product' && i.active !== false).map(i => ({ id: i.id, label: i.name })),
    selectedId: source.finished_product_id || '',
    onSelect: id => {
      const item = state.inventory.find(i => i.id === id);
      if (item) { const el = document.getElementById('f-yield-unit'); if (el) el.value = item.unit || ''; }
    },
  });
};

window.onAutoCreateToggle = function (which, checked) {
  const ssId   = which === 'wip' ? 'ss-recipe-wip' : 'ss-recipe-finished';
  const input  = document.querySelector(`#${ssId} .ss-input`);
  const hidden = document.querySelector(`#${ssId} .ss-value`);
  const list   = document.querySelector(`#${ssId} .ss-list`);
  if (!input) return;
  if (checked) {
    input.value = '';
    if (hidden) hidden.value = '';
    if (list)   list.classList.add('hidden');
    input.disabled    = true;
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
