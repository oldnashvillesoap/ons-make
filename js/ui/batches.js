/**
 * Batches Tab UI
 * Handles batch planning, display, execution, and forecasting
 */

import { parseIngredients, convertToGrams, formatDate } from '../core/conversions.js';
import { calculateFifoCost, deductMaterialFromInventory } from '../core/fifo.js';
import { generateForecastingAlerts } from '../core/forecasting.js';
import { getInputValue, clearInputs, setHTML, onClick, showConfirm, showAlert, setVisibility } from './common.js';
import { addBatch, subscribeToBatches, getNextBatchNumber, updateBatch } from '../db/queries.js';

let allBatches = [];

/**
 * Initialize batches tab
 * @param {Function} getRecipes - Callback to get all recipes
 * @param {Function} getInventory - Callback to get inventory ledger
 */
export function initBatchesUI(getRecipes, getInventory) {
    // Setup modal buttons
    onClick('open-batch-modal', () => openBatchModal(getRecipes));
    onClick('close-batch-modal', closeBatchModal);
    onClick('close-batch-modal-cancel', closeBatchModal);

    // Setup save batch button
    onClick('save-batch-planned', () => handleSaveBatch(getRecipes));

    // Setup real-time listener
    subscribeToBatches((batches) => {
        allBatches = batches;
        updateBatchesDisplay(batches, getRecipes, getInventory);
    });
}

/**
 * Open batch planning modal
 * @param {Function} getRecipes - Callback to get recipes
 */
function openBatchModal(getRecipes) {
    const batchModal = document.getElementById('batch-modal');
    const batchRecipeSelect = document.getElementById('batch-recipe');
    
    // Populate recipe dropdown
    const recipes = getRecipes();
    batchRecipeSelect.innerHTML = '<option value="">Select a recipe...</option>';
    recipes.forEach(recipe => {
        batchRecipeSelect.innerHTML += `<option value="${recipe.id}">${recipe.name}</option>`;
    });

    batchModal.classList.add('active');
}

/**
 * Close batch planning modal
 */
function closeBatchModal() {
    const batchModal = document.getElementById('batch-modal');
    batchModal.classList.remove('active');
    clearInputs('batch-date', 'batch-notes', 'batch-custom-ingredients', 'batch-recipe');
}

/**
 * Handle save batch form submission
 * @param {Function} getRecipes - Callback to get recipes
 */
async function handleSaveBatch(getRecipes) {
    const recipeId = getInputValue('batch-recipe');
    const date = getInputValue('batch-date');
    const notes = getInputValue('batch-notes');
    const customIngredients = getInputValue('batch-custom-ingredients');

    if (!recipeId || !date) {
        showAlert('Please select a recipe and date');
        return;
    }

    try {
        const batchNumber = await getNextBatchNumber();

        await addBatch({
            batchNumber,
            recipeId,
            date: new Date(date),
            notes,
            customIngredients,
            status: 'planned'
        });

        closeBatchModal();
    } catch (err) {
        console.error(err);
        showAlert('Error saving batch');
    }
}

/**
 * Update batches display
 * @param {array} batches - All batches
 * @param {Function} getRecipes - Callback to get recipes
 * @param {Function} getInventory - Callback to get inventory
 */
export function updateBatchesDisplay(batches, getRecipes, getInventory) {
    const recipes = getRecipes();
    const inventory = getInventory();

    updateForecastingAlerts(recipes, batches, inventory);
    updateBatchesList(batches, recipes, inventory);
}

/**
 * Update forecasting alerts
 * @param {array} recipes - All recipes
 * @param {array} batches - All batches
 * @param {array} inventory - Inventory ledger
 */
function updateForecastingAlerts(recipes, batches, inventory) {
    const alerts = generateForecastingAlerts(recipes, batches, inventory);
    const alertElement = document.getElementById('batch-forecasting-alert');
    
    if (alerts.length > 0) {
        document.getElementById('forecast-message').innerHTML = alerts.join('<br>');
        setVisibility(alertElement, true);
    } else {
        setVisibility(alertElement, false);
    }
}

/**
 * Update batches list display
 * @param {array} batches - All batches
 * @param {array} recipes - All recipes
 * @param {array} inventory - Inventory ledger
 */
function updateBatchesList(batches, recipes, inventory) {
    const batchesList = document.getElementById('batches-list');
    
    if (batches.length === 0) {
        batchesList.innerHTML = '<p class="text-stone-400">No batches yet.</p>';
        return;
    }

    batchesList.innerHTML = '';
    batches.forEach((batch) => {
        const recipe = recipes.find(r => r.id === batch.recipeId);
        const recipeNameDisplay = recipe ? recipe.name : 'Unknown Recipe';
        const statusClass = batch.status === 'planned' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200';
        const statusBg = batch.status === 'planned' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';

        batchesList.innerHTML += `
            <div class="bg-white p-5 rounded-lg border border-stone-200 shadow-sm ${statusClass}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <p class="text-lg font-bold text-stone-800">Batch #${batch.batchNumber}</p>
                        <p class="text-sm text-stone-600">${recipeNameDisplay} - ${formatDate(batch.date)}</p>
                    </div>
                    <span class="text-xs font-bold px-2 py-1 rounded ${statusBg}">${batch.status.toUpperCase()}</span>
                </div>

                <p class="text-sm text-stone-600 mb-3"><strong>Notes:</strong> ${batch.notes || 'None'}</p>

                <div class="bg-white p-3 rounded border border-stone-100 mb-3">
                    <p class="text-xs font-bold text-stone-600 mb-2">Ingredients:</p>
                    <p class="text-xs text-stone-600 whitespace-pre-wrap">${batch.customIngredients || (recipe ? recipe.ingredients : 'N/A')}</p>
                </div>

                ${batch.status === 'planned' ? `
                    <button class="execute-batch-btn w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700 transition text-sm" data-batch-id="${batch.docId}">Execute Batch</button>
                ` : `
                    <div class="bg-stone-50 p-3 rounded border border-stone-200">
                        <p class="text-xs text-stone-600"><strong>Total Cost:</strong> $${batch.totalCost?.toFixed(2) || '0.00'}</p>
                        <p class="text-xs text-stone-600"><strong>Cost Per Unit:</strong> $${batch.costPerUnit?.toFixed(2) || '0.00'}</p>
                    </div>
                `}
            </div>
        `;
    });

    // Attach execute batch listeners
    document.querySelectorAll('.execute-batch-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const batchId = e.target.dataset.batchId;
            await executeBatch(batchId, recipes, inventory);
        });
    });
}

/**
 * Execute a batch: deduct materials from inventory using FIFO and lock in costs
 * @param {string} batchId - Batch document ID
 * @param {array} recipes - All recipes
 * @param {array} inventory - Inventory ledger
 */
async function executeBatch(batchId, recipes, inventory) {
    if (!showConfirm('Execute this batch? Materials will be permanently deducted from inventory.')) {
        return;
    }

    const batch = allBatches.find(b => b.docId === batchId);
    const recipe = recipes.find(r => r.id === batch.recipeId);

    if (!recipe) {
        showAlert('Recipe not found');
        return;
    }

    // Get ingredients (custom or from recipe)
    let ingredients = parseIngredients(recipe.ingredients);
    if (batch.customIngredients) {
        ingredients = parseIngredients(batch.customIngredients);
    }

    // Check if we can fulfill the batch
    for (let ing of ingredients) {
        const amountNeeded = convertToGrams(ing.amount, ing.unit);
        const costCalc = calculateFifoCost(ing.name, amountNeeded, inventory);
        if (!costCalc.canFulfill) {
            showAlert(`Cannot execute batch: insufficient ${ing.name}`);
            return;
        }
    }

    try {
        // Deduct materials using FIFO and calculate actual costs
        let totalCost = 0;
        for (let ing of ingredients) {
            const amountNeeded = convertToGrams(ing.amount, ing.unit);
            const costCalc = calculateFifoCost(ing.name, amountNeeded, inventory);
            totalCost += costCalc.totalCost;

            // Actually deduct from inventory
            await deductMaterialFromInventory(ing.name, amountNeeded, inventory);
        }

        // Calculate cost per unit
        const yieldAmount = parseInt(recipe.yield) || 1;
        const costPerUnit = totalCost / yieldAmount;

        // Update batch to executed status
        await updateBatch(batchId, {
            status: 'executed',
            totalCost,
            costPerUnit,
            executedAt: new Date()
        });

        showAlert(`Batch #${batch.batchNumber} executed!\nTotal Cost: $${totalCost.toFixed(2)}\nCost Per Unit: $${costPerUnit.toFixed(2)}`);
    } catch (err) {
        console.error(err);
        showAlert('Error executing batch');
    }
}
