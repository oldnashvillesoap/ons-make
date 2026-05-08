import { state } from './state.js';
import { escHtml, fmtCur, batchStatusBadge } from './helpers.js';

function invValue(type) {
  return state.inventory
    .filter(i => i.type === type && i.active !== false)
    .reduce((s, i) => s + (i.stock_on_hand ?? 0) * (i.cost_per_unit ?? 0), 0);
}

export function renderDashboard() {
  const lowStockSort = (a, b) => (a.stock_on_hand ?? 0) - (b.stock_on_hand ?? 0) || (a.name || '').localeCompare(b.name || '');
  const lowStockRaw  = state.inventory.filter(i => i.active !== false && i.type === 'raw_material'    && (i.stock_on_hand ?? 0) <= (i.reorder_threshold ?? 0)).sort(lowStockSort);
  const lowStockFin  = state.inventory.filter(i => i.active !== false && i.type === 'finished_product' && (i.stock_on_hand ?? 0) <= (i.reorder_threshold ?? 0)).sort(lowStockSort);
  const lowStock     = [...lowStockRaw, ...lowStockFin];
  const active       = state.batches.filter(b => b.status === 'in_progress' || b.status === 'curing');
  const recent       = [...state.batches].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const rawVal       = invValue('raw_material');
  const wipVal       = invValue('wip');
  const finishedVal  = invValue('finished_product');

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
