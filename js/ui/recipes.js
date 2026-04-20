/**
 * Recipes Tab UI
 * Handles recipe form, display, and interactions
 */

import { calculateRecipeCost } from '../core/recipes.js';
import { getInputValue, clearInputs, setHTML, onClick } from './common.js';
import { addRecipe, subscribeToRecipes } from '../db/queries.js';

let allRecipes = [];
let onPlanBatchClick = null;

/**
 * Initialize recipes tab
 * @param {Function} onPlanBatch - Callback when "Plan Batch" clicked (receives recipeId)
 */
export function initRecipesUI(onPlanBatch) {
    onPlanBatchClick = onPlanBatch;

    // Setup save recipe button
    onClick('save-recipe', handleSaveRecipe);

    // Setup real-time listener
    subscribeToRecipes((recipes) => {
        allRecipes = recipes;
        updateRecipesDisplay(recipes, []);
    });
}

/**
 * Update recipes display and listener for inventory changes
 * @param {array} recipes - All recipes
 * @param {array} ledger - Inventory ledger
 */
export function updateRecipesDisplay(recipes, ledger) {
    const recipeList = document.getElementById('recipe-list');
    recipeList.innerHTML = '';
    
    if (recipes.length === 0) {
        recipeList.innerHTML = '<p class="text-stone-400">No recipes yet. Create one above!</p>';
        return;
    }

    recipes.forEach(recipe => {
        const costData = calculateRecipeCost(recipe, ledger);
        const totalCost = costData.totalCost;
        const costPerUnit = costData.costPerUnit;

        recipeList.innerHTML += `
            <div class="bg-white p-5 rounded-lg border-l-4 border-emerald-500 shadow-sm flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-lg text-stone-800">${recipe.name}</h3>
                        <span class="bg-stone-100 text-stone-500 text-xs px-2 py-1 rounded">${recipe.category}</span>
                    </div>
                    <p class="text-sm font-semibold text-emerald-700 mb-2">Yield: ${recipe.yield || 'N/A'}</p>
                    <p class="text-sm whitespace-pre-wrap text-stone-600 bg-stone-50 p-2 rounded border border-stone-100">${recipe.ingredients}</p>
                </div>
                <div class="mt-4 pt-4 border-t border-stone-100">
                    <div class="grid grid-cols-3 gap-2 text-center mb-3">
                        <div class="bg-emerald-50 p-2 rounded">
                            <p class="text-xs text-stone-500">Total Cost</p>
                            <p class="text-sm font-bold text-emerald-700">$${totalCost}</p>
                        </div>
                        <div class="bg-emerald-50 p-2 rounded">
                            <p class="text-xs text-stone-500">Per Unit</p>
                            <p class="text-sm font-bold text-emerald-700">$${costPerUnit}</p>
                        </div>
                        <div class="bg-emerald-50 p-2 rounded">
                            <p class="text-xs text-stone-500">Units</p>
                            <p class="text-sm font-bold text-emerald-700">${recipe.yield || '?'}</p>
                        </div>
                    </div>
                    <button class="w-full text-sm text-emerald-600 hover:bg-emerald-50 p-1 rounded transition plan-batch-btn" data-recipe-id="${recipe.id}">Plan Batch</button>
                </div>
            </div>
        `;
    });

    // Attach event listeners to "Plan Batch" buttons
    document.querySelectorAll('.plan-batch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const recipeId = e.target.dataset.recipeId;
            if (onPlanBatchClick) {
                onPlanBatchClick(recipeId);
            }
        });
    });
}

/**
 * Handle save recipe form submission
 */
async function handleSaveRecipe() {
    const name = getInputValue('recipe-name');
    const category = getInputValue('recipe-category');
    const yieldAmt = getInputValue('recipe-yield');
    const ingredients = getInputValue('recipe-ingredients');

    if (!name || !ingredients) {
        alert('Please enter recipe name and ingredients');
        return;
    }

    try {
        await addRecipe({
            name,
            category,
            yield: yieldAmt,
            ingredients
        });

        // Clear form
        clearInputs('recipe-name', 'recipe-category', 'recipe-yield', 'recipe-ingredients');
    } catch (err) {
        console.error(err);
        alert('Error saving recipe');
    }
}

/**
 * Get all recipes (for external use)
 * @returns {array}
 */
export function getAllRecipes() {
    return allRecipes;
}
