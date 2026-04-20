/**
 * ArtisanOS - Main Entry Point
 * Initializes all modules and coordinates the application
 */

import { initAuthUI } from './ui/auth.js';
import { initRecipesUI, getAllRecipes, updateRecipesDisplay } from './ui/recipes.js';
import { initInventoryUI, getInventoryLedger, updateInventoryDisplay } from './ui/inventory.js';
import { initBatchesUI, updateBatchesDisplay } from './ui/batches.js';
import { onClick } from './ui/common.js';

/**
 * Initialize the entire application
 */
function initApp() {
    // Setup tab navigation
    setupTabs();

    // Initialize authentication
    initAuthUI(onUserLogin, onUserLogout);

    // Initialize UI modules
    initRecipesUI(handlePlanBatch);
    initInventoryUI();
    initBatchesUI(getAllRecipes, getInventoryLedger);
}

/**
 * Setup tab navigation
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active styling from all tabs
            tabs.forEach(t => t.classList.remove('tab-active'));
            tab.classList.add('tab-active');
            
            // Hide all content, show target
            contents.forEach(c => c.classList.add('hidden'));
            document.getElementById(tab.dataset.target).classList.remove('hidden');

            // Refresh data when switching to batches tab
            if (tab.dataset.target === 'view-batches') {
                updateBatchesDisplay(
                    getAllRecipes(),
                    getAllRecipes,
                    getInventoryLedger
                );
            }
        });
    });
}

/**
 * Called when user logs in
 * @param {Object} user - Firebase user object
 */
function onUserLogin(user) {
    console.log('User logged in:', user.email);
    // Data loading is handled by the individual modules via onSnapshot listeners
}

/**
 * Called when user logs out
 */
function onUserLogout() {
    console.log('User logged out');
    // UI is automatically hidden by auth listener
}

/**
 * Handle plan batch button click from recipe
 * @param {string} recipeId - Recipe ID
 */
function handlePlanBatch(recipeId) {
    // Switch to batches tab
    const batchTab = document.querySelector('[data-target="view-batches"]');
    batchTab.click();
    
    // Open batch modal and pre-select recipe
    const batchModal = document.getElementById('batch-modal');
    document.getElementById('batch-recipe').value = recipeId;
    batchModal.classList.add('active');
}

/**
 * Sync recipe costs when inventory changes
 * This ensures recipe costs update as inventory is modified
 */
export function syncRecipeCosts() {
    updateRecipesDisplay(getAllRecipes(), getInventoryLedger());
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
