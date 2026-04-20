/**
 * Forecasting & Alerts
 * Identify material shortages from planned production
 */

import { parseIngredients, convertToGrams, UNIT_TO_GRAMS } from './conversions.js';
import { getTotalMaterialQuantity } from './fifo.js';

/**
 * Check for forecasting issues
 * Look at all planned batches and see if there's enough inventory for them
 * @param {array} recipes - All recipes
 * @param {array} batches - All batches
 * @param {array} ledger - Current inventory ledger
 * @returns {array} - Array of alert messages
 */
export function generateForecastingAlerts(recipes, batches, ledger) {
    const alerts = [];
    const plannedBatches = batches.filter(b => b.status === 'planned');
    
    if (plannedBatches.length === 0) return alerts;

    // Calculate total material needs from planned batches
    const materialNeeds = {};
    plannedBatches.forEach(batch => {
        const recipe = recipes.find(r => r.id === batch.recipeId);
        if (!recipe) return;

        let ingredients = parseIngredients(recipe.ingredients);
        if (batch.customIngredients) {
            ingredients = parseIngredients(batch.customIngredients);
        }

        ingredients.forEach(ing => {
            const amountInGrams = convertToGrams(ing.amount, ing.unit);
            materialNeeds[ing.name] = (materialNeeds[ing.name] || 0) + amountInGrams;
        });
    });

    // Check each material
    Object.entries(materialNeeds).forEach(([material, needed]) => {
        const available = getTotalMaterialQuantity(material, ledger);
        if (available < needed) {
            const shortage = (needed - available) / UNIT_TO_GRAMS['lb']; // Convert to lbs for display
            alerts.push(`Short on ${material}: Need ${shortage.toFixed(2)} more lbs`);
        }
    });

    return alerts;
}
