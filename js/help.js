import { escHtml } from './helpers.js';

const HELP_DOCS = [
  { slug: 'getting-started', label: 'Getting Started',  icon: 'rocket_launch' },
  { slug: 'dashboard',       label: 'Dashboard',        icon: 'dashboard' },
  { slug: 'inventory',       label: 'Inventory',        icon: 'inventory_2' },
  { slug: 'recipes',         label: 'Recipes',          icon: 'menu_book' },
  { slug: 'batches',         label: 'Batches',          icon: 'science' },
  { slug: 'transactions',    label: 'Transactions',     icon: 'receipt_long' },
];

export function renderHelp() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">Help</div>
        <div class="page-sub">User guide and documentation</div>
      </div>
    </div>
    <div class="help-layout">
      <nav class="help-nav card">
        ${HELP_DOCS.map(d => `
          <a class="help-nav-item" data-slug="${escHtml(d.slug)}" onclick="loadHelpDoc('${escHtml(d.slug)}')">
            <span class="material-icons">${escHtml(d.icon)}</span>${escHtml(d.label)}
          </a>`).join('')}
      </nav>
      <div class="help-content card" id="help-content">
        <div class="loading-screen"><span class="material-icons spin">refresh</span></div>
      </div>
    </div>`;
}

export function setupHelpEvents() {
  loadHelpDoc('getting-started');
}

window.loadHelpDoc = async function (slug) {
  document.querySelectorAll('.help-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.slug === slug));
  const content = document.getElementById('help-content');
  if (!content) return;
  content.innerHTML = `<div class="loading-screen"><span class="material-icons spin">refresh</span></div>`;
  try {
    const res = await fetch(`docs/${slug}.md`);
    if (!res.ok) throw new Error('not found');
    const text = await res.text();
    content.innerHTML = `<div class="help-body">${marked.parse(text)}</div>`;
    content.scrollTop = 0;
  } catch {
    content.innerHTML = `<p class="text-muted" style="padding:24px">Could not load documentation.</p>`;
  }
};
