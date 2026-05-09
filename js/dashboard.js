import { state } from './state.js';
import { escHtml, fmtCur, batchStatusBadge } from './helpers.js';

function invValue(type) {
  return state.inventory
    .filter(i => i.type === type && i.active !== false)
    .reduce((s, i) => s + (i.stock_on_hand ?? 0) * (i.cost_per_unit ?? 0), 0);
}

export function renderDashboard() {
  // Demand committed by planned + in-progress batches, converted to purchase units
  const demandMap = {};
  state.batches
    .filter(b => b.status === 'planned' || b.status === 'in_progress')
    .forEach(b => (b.ingredients || []).forEach(ing => {
      if (!ing.item_id) return;
      const item = state.inventory.find(i => i.id === ing.item_id);
      const conv = item?.conversion_factor || 1;
      demandMap[ing.item_id] = (demandMap[ing.item_id] || 0) + (ing.quantity || 0) / conv;
    }));

  const available    = i => (i.stock_on_hand ?? 0) - (demandMap[i.id] || 0);
  const lowStockSort = (a, b) => available(a) - available(b) || (a.name || '').localeCompare(b.name || '');
  const lowStockRaw  = state.inventory.filter(i => i.active !== false && i.type === 'raw_material'    && available(i) <= (i.reorder_threshold ?? 0)).sort(lowStockSort);
  const lowStockFin  = state.inventory.filter(i => i.active !== false && i.type === 'finished_product' && available(i) <= (i.reorder_threshold ?? 0)).sort(lowStockSort);
  const lowStock     = [...lowStockRaw, ...lowStockFin];
  const active       = state.batches.filter(b => b.status === 'planned' || b.status === 'in_progress' || b.status === 'curing');
  const recent       = [...state.batches].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const rawVal       = invValue('raw_material');
  const wipVal       = invValue('wip');
  const finishedVal  = invValue('finished_product');

  const lowStockTableRows = items => items.length
    ? items.map(i => {
        const committed = demandMap[i.id] || 0;
        const avail     = available(i);
        const unit      = escHtml(i.unit || '');
        return `
        <tr>
          <td class="font-medium card-title">${escHtml(i.name)}</td>
          <td data-label="On Hand" class="font-mono">${i.stock_on_hand ?? 0} ${unit}</td>
          <td data-label="Committed" class="font-mono text-muted">${committed > 0 ? +committed.toFixed(2) + ' ' + unit : '—'}</td>
          <td data-label="Available" class="font-mono ${avail < 0 ? 'low-stock' : 'low-stock-warn'}">${+avail.toFixed(2)} ${unit}</td>
          <td data-label="Reorder At" class="font-mono text-muted">${i.reorder_threshold ?? 0} ${unit}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="text-center text-muted" style="padding:16px">None</td></tr>`;

  const recentRows = recent.length
    ? recent.map(b => `
        <tr>
          <td class="font-medium card-title">${escHtml(b.recipe_name || '—')}</td>
          <td data-label="Date" class="text-muted">${escHtml(b.date || '—')}</td>
          <td data-label="Status">${batchStatusBadge(b.status)}</td>
          <td data-label="Yield" class="font-mono">${b.yield_quantity ?? '—'} ${escHtml(b.yield_unit || '')}</td>
          <td data-label="Cost / Unit" class="font-mono">${fmtCur(b.cost_per_unit)}</td>
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

    <div class="low-stock-grid" style="margin-bottom:20px">
      <div class="section card">
        <div class="section-header">
          <span class="section-title">⚠ Raw Materials</span>
          <span class="badge badge-${lowStockRaw.length ? 'red' : 'green'}">${lowStockRaw.length} item${lowStockRaw.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>On Hand</th><th>Committed</th><th>Available</th><th>Reorder At</th></tr></thead>
            <tbody>${lowStockTableRows(lowStockRaw)}</tbody>
          </table>
        </div>
      </div>
      <div class="section card">
        <div class="section-header">
          <span class="section-title">⚠ Finished Products</span>
          <span class="badge badge-${lowStockFin.length ? 'red' : 'green'}">${lowStockFin.length} item${lowStockFin.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>On Hand</th><th>Committed</th><th>Available</th><th>Reorder At</th></tr></thead>
            <tbody>${lowStockTableRows(lowStockFin)}</tbody>
          </table>
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
