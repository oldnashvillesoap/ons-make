import { state } from './state.js';
import { buildSearchSelect } from './ui.js';
import { escHtml } from './helpers.js';

let _ingredients = [];

const CATEGORY_ORDER = [
  'hard oils', 'liquid oils', 'liquids', 'chemicals',
  'additives', 'colorant', 'fragrance', 'packaging',
];

function categoryRank(ing) {
  const item = state.inventory.find(i => i.id === ing.item_id);
  const cat = (item?.category || '').toLowerCase();
  const rank = CATEGORY_ORDER.indexOf(cat);
  return rank === -1 ? CATEGORY_ORDER.length : rank;
}

export function sortIngredientsByCategory(ings) {
  return [...ings].sort((a, b) => categoryRank(a) - categoryRank(b));
}

export function getIngredients()    { return _ingredients; }
export function setIngredients(arr) { _ingredients = arr; }
export function clearIngredients()  { _ingredients = []; }

export function refreshIngredientRows(context) {
  const container = document.getElementById('ingredient-rows');
  if (!container) return;

  const rawMats = state.inventory.filter(i => i.type === 'raw_material');
  const isBatch = context === 'batch';

  _ingredients.sort((a, b) => categoryRank(a) - categoryRank(b));

  container.innerHTML = _ingredients.map((ing, idx) => {
    const isInactive = ing.item_id && state.inventory.find(i => i.id === ing.item_id)?.active === false;
    return `
    <div class="ingredient-row${isInactive ? ' ingredient-inactive' : ''}" id="ing-row-${idx}">
      ${isBatch ? `<input type="checkbox" onchange="document.getElementById('ing-row-${idx}').classList.toggle('ingredient-done',this.checked)">` : '<span></span>'}
      <div class="search-select" id="ss-ing-${idx}"></div>
      <input type="number" min="0" step="any" value="${ing.quantity||''}" placeholder="Qty"
             oninput="_ingSetQty(${idx},this.value,'${context}')">
      <input type="text" value="${escHtml(ing.production_unit||ing.unit||'')}" readonly placeholder="unit">
      <span class="row-cost">${ing.line_cost ? '$'+ing.line_cost.toFixed(2) : '—'}</span>
      <button type="button" class="btn-icon danger" onclick="removeIngredientRow(${idx},'${context}')">
        <span class="material-icons">close</span>
      </button>
    </div>`;
  }).join('');

  _ingredients.forEach((ing, idx) => {
    buildSearchSelect({
      containerId: `ss-ing-${idx}`,
      placeholder: 'Search items…',
      items: rawMats.map(i => ({ id: i.id, label: i.name, inactive: i.active === false })),
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
          row.classList.toggle('ingredient-inactive', item.active === false);
        }
        updateIngredientCost(idx, context);
      },
    });
  });

  updateCostSummary(context);
}

export function addIngredientRow(context) {
  _ingredients.push({ item_id: '', name: '', quantity: 0, unit: '', cost_per_unit: 0, line_cost: 0 });
  refreshIngredientRows(context);
}

export function removeIngredientRow(idx, context) {
  _ingredients.splice(idx, 1);
  refreshIngredientRows(context);
}

export function updateIngredientCost(idx, context) {
  const ing = _ingredients[idx];
  ing.line_cost = +((ing.quantity || 0) * (ing.cost_per_unit || 0)).toFixed(4);
  const span = document.querySelectorAll('.row-cost')[idx];
  if (span) span.textContent = ing.line_cost ? `$${ing.line_cost.toFixed(2)}` : '—';
  updateCostSummary(context || (document.getElementById('f-yield-qty') ? 'recipe' : 'batch'));
}

export function updateCostSummary() {
  const total = _ingredients.reduce((s, i) => s + (i.line_cost || 0), 0);
  const qty   = parseFloat(document.getElementById('f-yield-qty')?.value) || 0;
  const batchEl = document.getElementById('cs-batch');
  const unitEl  = document.getElementById('cs-unit');
  if (batchEl) batchEl.textContent = `$${total.toFixed(2)}`;
  if (unitEl)  unitEl.textContent  = qty > 0 ? `$${(total / qty).toFixed(4)}` : '—';
}

export function collectIngredientInputs() {
  document.querySelectorAll('.ingredient-row').forEach((row, idx) => {
    if (!_ingredients[idx]) return;
    const qtyInput = row.querySelector('input[type="number"]');
    if (qtyInput) {
      _ingredients[idx].quantity  = parseFloat(qtyInput.value) || 0;
      _ingredients[idx].line_cost = +(_ingredients[idx].quantity * (_ingredients[idx].cost_per_unit || 0)).toFixed(4);
    }
  });
}

// Window assignments for inline HTML event handlers
window._ingSetQty          = (idx, v, ctx) => { _ingredients[idx].quantity = parseFloat(v) || 0; updateIngredientCost(idx, ctx); };
window.addIngredientRow    = addIngredientRow;
window.removeIngredientRow = removeIngredientRow;
window.updateIngredientCost = updateIngredientCost;
window.updateCostSummary   = updateCostSummary;
