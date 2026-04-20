/**
 * Recipe Cost Calculation
 * Calculate total cost and cost-per-unit for recipes based on FIFO inventory
 */

import { parseIngredients, convertToGrams } from './conversions.js';
import { calculateFifoCost } from './fifo.js';

/**
 * Calculate the total cost and cost-per-unit of a recipe
 * @param {object} recipe - Recipe object with name, yield, ingredients
 * @param {array} ledger - Current inventory ledger
 * @returns {object} - { totalCost, costPerUnit, materialCosts, ingredients }
 */
export function calculateRecipeCost(recipe, ledger) {
    let totalCost = 0;
    const materialCosts = {};

    const ingredients = parseIngredients(recipe.ingredients);
    ingredients.forEach(ing => {
        const amountInGrams = convertToGrams(ing.amount, ing.unit);
        const costCalc = calculateFifoCost(ing.name, amountInGrams, ledger);
        const cost = costCalc.totalCost;
        totalCost += cost;
        materialCosts[ing.name] = cost;
    });

    const yield_amount = parseInt(recipe.yield) || 1;
    const costPerUnit = totalCost / yield_amount;

    return {
        totalCost: totalCost.toFixed(2),
        costPerUnit: costPerUnit.toFixed(2),
        materialCosts,
        ingredients
    };
}
