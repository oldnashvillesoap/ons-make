import { UNITS } from './state.js';

export function fmt(n) { return typeof n === 'number' ? n.toFixed(2) : '—'; }
export function fmtCur(n) { return typeof n === 'number' ? `$${n.toFixed(2)}` : '—'; }
export function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function val(id) { return (document.getElementById(id) || {}).value || ''; }
export function numVal(id) { return parseFloat(val(id)) || 0; }

export function batchAge(dateStr) {
  if (!dateStr) return '—';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 0)   return '—';
  if (days < 7)   return `${days}d`;
  if (days < 60)  return `${Math.floor(days / 7)}wk`;
  if (days < 730) return `${Math.floor(days / 30.44)}mo`;
  return `${Math.floor(days / 365.25)}yr`;
}

export function batchStatusBadge(status) {
  const map = { planned: 'purple', in_progress: 'blue', curing: 'amber', complete: 'green', failed: 'red' };
  return `<span class="badge badge-${map[status] || 'gray'}">${escHtml(status?.replace('_',' ') || '—')}</span>`;
}

export function typeBadge(type) {
  if (type === 'raw_material')     return `<span class="badge badge-blue">Raw Material</span>`;
  if (type === 'finished_product') return `<span class="badge badge-green">Finished</span>`;
  if (type === 'wip')              return `<span class="badge badge-amber">WIP</span>`;
  return `<span class="badge badge-gray">${escHtml(type || '—')}</span>`;
}

export function txTypeBadge(type) {
  return type === 'addition'
    ? `<span class="badge badge-green">Addition</span>`
    : `<span class="badge badge-red">Deduction</span>`;
}

export function unitSelect(id, selected, attrs = '') {
  return `<select id="${id}" ${attrs}>
    <option value="">— Select unit —</option>
    ${UNITS.map(u => `<option value="${u}" ${selected===u?'selected':''}>${u}</option>`).join('')}
  </select>`;
}
