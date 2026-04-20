/**
 * FIFO (First-In, First-Out) Inventory Management
 * Core algorithms for FIFO costing and inventory deduction
 */

import { convertToGrams, UNIT_TO_GRAMS } from './conversions.js';
import { db } from '../config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Calculate the cost per unit of a material based on FIFO inventory
 * Returns the cost/unit of the oldest (next to be consumed) batch
 * @param {string} materialName - Name of the material
 * @param {array} ledger - Array of inventory entries (ordered by date, oldest first)
 * @returns {number} - Cost per unit, or 0 if no inventory
 */
export function getCurrentFifoCostPerUnit(materialName, ledger) {
    const entry = ledger.find(e => e.material.toLowerCase() === materialName.toLowerCase());
    return entry ? entry.costPerUnit : 0;
}

/**
 * Calculate total available quantity of a material (sum of all ledger entries)
 * All quantities are converted to grams
 * @param {string} materialName - Name of the material
 * @param {array} ledger - Inventory ledger entries
 * @returns {number} - Total quantity in grams
 */
export function getTotalMaterialQuantity(materialName, ledger) {
    return ledger
        .filter(e => e.material.toLowerCase() === materialName.toLowerCase())
        .reduce((sum, e) => sum + convertToGrams(e.quantityRemaining, e.unit), 0);
}

/**
 * Simulate consumption of a material following FIFO
 * Returns the cost of consuming the requested amount
 * Does NOT modify the ledger - use for calculations only
 * @param {string} materialName - Name of the material
 * @param {number} amountNeeded - In grams
 * @param {array} ledger - Ledger entries, assumed to be in FIFO order
 * @returns {object} - { canFulfill: boolean, totalCost: number, materialConsumed: number }
 */
export function calculateFifoCost(materialName, amountNeeded, ledger) {
    let remaining = amountNeeded;
    let totalCost = 0;
    let materialConsumed = 0;

    for (let entry of ledger) {
        if (entry.material.toLowerCase() !== materialName.toLowerCase()) continue;
        if (remaining <= 0) break;

        const availableInGrams = convertToGrams(entry.quantityRemaining, entry.unit);
        const consumeAmount = Math.min(remaining, availableInGrams);

        totalCost += consumeAmount * entry.costPerUnit;
        materialConsumed += consumeAmount;
        remaining -= consumeAmount;
    }

    return {
        canFulfill: remaining <= 0.01, // Account for floating point errors
        totalCost,
        materialConsumed
    };
}

/**
 * Deduct material from inventory following FIFO
 * MODIFIES the ledger permanently - use only when executing batches
 * @param {string} materialName - Name of the material
 * @param {number} amountNeeded - In grams
 * @param {array} ledger - Ledger entries to modify (in place)
 */
export async function deductMaterialFromInventory(materialName, amountNeeded, ledger) {
    let remaining = amountNeeded;

    for (let i = 0; i < ledger.length && remaining > 0; i++) {
        let entry = ledger[i];
        if (entry.material.toLowerCase() !== materialName.toLowerCase()) continue;

        const availableInGrams = convertToGrams(entry.quantityRemaining, entry.unit);
        const consumeAmount = Math.min(remaining, availableInGrams);
        const consumeInOriginalUnit = consumeAmount / UNIT_TO_GRAMS[entry.unit];

        entry.quantityRemaining -= consumeInOriginalUnit;
        remaining -= consumeAmount;

        // Update in Firestore
        await updateDoc(doc(db, "inventory", entry.docId), {
            quantityRemaining: entry.quantityRemaining
        });
    }
}
