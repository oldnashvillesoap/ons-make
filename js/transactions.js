import { state } from './state.js';
import { escHtml, fmtCur, txTypeBadge, unitSelect } from './helpers.js';
import { addDoc, updateDoc, adjustStock, reload } from './db.js';
import { openModal, closeModal, toast } from './ui.js';
import { navigate } from './nav.js';

function txRows() {
  const f = state.txFilter;
  const q = state.txSearch.toLowerCase();
  const txns = state.transactions
    .filter(t => f === 'all' || t.type === f)
    .filter(t => !q || (t.item_name||'').toLowerCase().includes(q) || (t.reason||'').toLowerCase().includes(q))
    .sort((a, b) => (b.date||'').localeCompare(a.date||''));
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

export function renderTransactions() {
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

export function setupTransactionEvents() {
  document.getElementById('tx-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.txFilter = tab.dataset.filter;
    navigate('transactions');
  });
}

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

async function saveTransaction() {
  const itemEl = document.getElementById('f-item');
  const opt    = itemEl?.options[itemEl.selectedIndex];
  const qty    = parseFloat(document.getElementById('f-qty')?.value) || 0;
  if (!itemEl?.value) { toast('Select an item', 'error'); return; }
  if (!qty)           { toast('Enter a quantity', 'error'); return; }
  const costPerUnit = parseFloat(document.getElementById('f-cost')?.value) || 0;
  const data = {
    type:          document.getElementById('f-type')?.value,
    item_id:       itemEl.value,
    item_name:     opt?.dataset?.name || '',
    quantity:      qty,
    unit:          document.getElementById('f-unit')?.value,
    cost_per_unit: costPerUnit,
    total_cost:    +(qty * costPerUnit).toFixed(4),
    reason:        document.getElementById('f-reason')?.value.trim(),
    batch_id:      document.getElementById('f-batch')?.value.trim(),
    date:          new Date(document.getElementById('f-date')?.value).toISOString(),
  };
  try {
    await addDoc('inventory_transactions', data);
    if (data.type === 'addition') {
      await adjustStock(itemEl.value, qty);
      if (costPerUnit > 0) await updateDoc('inventory_items', itemEl.value, { cost_per_unit: costPerUnit });
    }
    await reload('inventory_items');
    await reload('inventory_transactions');
    toast('Transaction recorded');
    closeModal();
    navigate('transactions');
  } catch (e) { toast('Save failed', 'error'); console.error(e); }
}

// ─── WINDOW HANDLERS ─────────────────────────────────────────
window.onTxSearch = function (q) {
  state.txSearch = q;
  const el = document.getElementById('tx-tbody');
  if (el) el.innerHTML = txRows();
};

window.openTransactionAdd = function () {
  openModal('Record Inventory Movement', transactionForm(), saveTransaction);
};

window.onTxItemSelect = function (sel) {
  const opt    = sel.options[sel.selectedIndex];
  const unitEl = document.getElementById('f-unit');
  const costEl = document.getElementById('f-cost');
  if (unitEl) unitEl.value = opt.dataset.unit || '';
  if (costEl) costEl.value = opt.dataset.cost || '';
  window.updateTxCost();
};

window.updateTxCost = function () {
  const qty   = parseFloat(document.getElementById('f-qty')?.value)  || 0;
  const cost  = parseFloat(document.getElementById('f-cost')?.value) || 0;
  const total = document.getElementById('f-total');
  if (total) total.value = `$${(qty * cost).toFixed(2)}`;
};
