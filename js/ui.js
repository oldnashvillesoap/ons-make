import { escHtml } from './helpers.js';

let _toastTimer;
let _onModalClose = null;

export function setModalCloseHook(fn) { _onModalClose = fn; }

export function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

export function openModal(title, bodyHTML, onSave, large = false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal').className = large ? 'modal lg' : 'modal';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-footer').style.display = '';
  window._onSave = onSave;
}

export function openViewModal(title, bodyHTML) {
  openModal(title, bodyHTML, null);
  document.getElementById('modal-footer').style.display = 'none';
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  window._onSave = null;
  if (_onModalClose) _onModalClose();
}

export function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('modal-save').addEventListener('click', () => {
    if (window._onSave) window._onSave();
  });
}

export function buildSearchSelect({ containerId, placeholder, items, selectedId, onSelect }) {
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
