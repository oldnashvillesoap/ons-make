import { state } from './state.js';
import { setDb, loadAll } from './db.js';
import { setupModal, setModalCloseHook } from './ui.js';
import { setNavigate } from './nav.js';
import { clearIngredients } from './ingredients.js';
import { escHtml } from './helpers.js';
import { renderDashboard } from './dashboard.js';
import { renderInventory, setupInventoryEvents } from './inventory.js';
import { renderRecipes, setupRecipeEvents } from './recipes.js';
import { renderBatches, setupBatchEvents } from './batches.js';
import { renderTransactions, setupTransactionEvents } from './transactions.js';
import { renderHelp, setupHelpEvents } from './help.js';

// ─── ROUTER ──────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view));
  const renders = { dashboard: renderDashboard, inventory: renderInventory, recipes: renderRecipes, batches: renderBatches, transactions: renderTransactions, help: renderHelp };
  document.getElementById('main').innerHTML = renders[view]();
  const setups = { inventory: setupInventoryEvents, recipes: setupRecipeEvents, batches: setupBatchEvents, transactions: setupTransactionEvents, help: setupHelpEvents };
  if (setups[view]) setups[view]();
}

setNavigate(navigate);
setModalCloseHook(clearIngredients);

// ─── NAV ─────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.view);
    });
  });
}

// ─── SIDEBAR ─────────────────────────────────────────────────
function renderSidebarUser(user) {
  document.getElementById('sidebar-user').innerHTML = `
    <div class="sidebar-user-info">
      ${user.photoURL
        ? `<img src="${escHtml(user.photoURL)}" class="sidebar-user-avatar" alt="">`
        : `<span class="material-icons" style="font-size:28px;color:var(--text-muted)">account_circle</span>`}
      <span class="sidebar-user-name">${escHtml(user.displayName || user.email || 'User')}</span>
    </div>
    <button class="btn-signout" onclick="signOut()">
      <span class="material-icons" style="font-size:16px">logout</span>Sign out
    </button>`;
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

window.signOut = () => firebase.auth().signOut();

// ─── INIT ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const db   = firebase.firestore();
  const auth = firebase.auth();
  setDb(db);
  setupNav();
  setupModal();

  document.getElementById('btn-google-signin').addEventListener('click', async () => {
    document.getElementById('login-error').classList.add('hidden');
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (e) {
      console.error('Sign-in failed:', e);
    }
  });

  auth.onAuthStateChanged(async user => {
    if (user) {
      try {
        const entry = await db.collection('allowed_users').doc(user.uid).get();
        if (!entry.exists) {
          await auth.signOut();
          showLoginError('Access denied. Ask an admin to add your account.');
          return;
        }
      } catch (e) {
        await auth.signOut();
        showLoginError('Access denied. Ask an admin to add your account.');
        return;
      }
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      renderSidebarUser(user);
      await loadAll();
      navigate('dashboard');
    } else {
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
    }
  });
});
