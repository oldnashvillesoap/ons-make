/**
 * Inventory Tab UI
 * Handles inventory form, display, and ledger
 */

import { formatDate } from '../core/conversions.js';
import { getInputValue, clearInputs, setHTML, onClick } from './common.js';
import { addInventory, subscribeToInventory } from '../db/queries.js';

let inventoryLedger = [];

/**
 * Initialize inventory tab
 */
export function initInventoryUI() {
    // Setup save inventory button
    onClick('save-inventory', handleSaveInventory);

    // Setup real-time listener
    subscribeToInventory((inventory) => {
        inventoryLedger = inventory;
        updateInventoryDisplay(inventory);
    });
}

/**
 * Update inventory display (summary and ledger)
 * @param {array} ledger - Inventory ledger
 */
export function updateInventoryDisplay(ledger) {
    updateInventorySummary(ledger);
    updateLedgerTable(ledger);
}

/**
 * Update inventory summary cards
 * @param {array} ledger - Inventory ledger
 */
function updateInventorySummary(ledger) {
    const inventorySummary = document.getElementById('inventory-summary');
    
    // Group by material
    const materialGroups = {};
    ledger.forEach(entry => {
        if (!materialGroups[entry.material]) {
            materialGroups[entry.material] = {
                unit: entry.unit,
                totalQty: 0,
                totalCost: 0,
                costPerUnit: entry.costPerUnit
            };
        }
        materialGroups[entry.material].totalQty += entry.quantityRemaining;
        materialGroups[entry.material].totalCost += entry.quantityRemaining * entry.costPerUnit;
    });

    inventorySummary.innerHTML = '';
    Object.entries(materialGroups).forEach(([material, info]) => {
        inventorySummary.innerHTML += `
            <div class="bg-stone-50 p-4 rounded border border-stone-200">
                <p class="font-bold text-stone-800">${material}</p>
                <p class="text-sm text-stone-600 mt-1">Qty: ${info.totalQty.toFixed(2)} ${info.unit}</p>
                <p class="text-sm text-stone-600">Cost/Unit: $${info.costPerUnit.toFixed(4)}</p>
                <p class="text-sm text-emerald-700 font-bold mt-1">Total: $${info.totalCost.toFixed(2)}</p>
            </div>
        `;
    });

    if (Object.keys(materialGroups).length === 0) {
        inventorySummary.innerHTML = '<p class="text-stone-400">No inventory logged yet.</p>';
    }
}

/**
 * Update ledger table
 * @param {array} ledger - Inventory ledger
 */
function updateLedgerTable(ledger) {
    const ledgerRows = document.getElementById('ledger-rows');
    ledgerRows.innerHTML = '';
    
    if (ledger.length === 0) {
        ledgerRows.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-stone-400">No inventory entries</td></tr>';
        return;
    }

    ledger.forEach((entry) => {
        const totalCost = (entry.quantityRemaining * entry.costPerUnit).toFixed(2);
        ledgerRows.innerHTML += `
            <tr class="border-b border-stone-100 hover:bg-stone-50">
                <td class="text-left p-2">${entry.material}</td>
                <td class="text-left p-2">${entry.unit}</td>
                <td class="text-right p-2">${entry.quantityRemaining.toFixed(2)}</td>
                <td class="text-right p-2">$${entry.costPerUnit.toFixed(4)}</td>
                <td class="text-right p-2">$${totalCost}</td>
                <td class="text-left p-2 text-stone-500 text-sm">${formatDate(entry.dateReceived)}</td>
            </tr>
        `;
    });
}

/**
 * Handle save inventory form submission
 */
async function handleSaveInventory() {
    const material = getInputValue('inventory-material');
    const unit = getInputValue('inventory-unit');
    const quantity = parseFloat(getInputValue('inventory-quantity'));
    const totalCost = parseFloat(getInputValue('inventory-cost'));

    if (!material || !quantity || !totalCost) {
        alert('Please fill in all inventory fields');
        return;
    }

    const costPerUnit = totalCost / quantity;

    try {
        await addInventory({
            material,
            unit,
            quantity,
            quantityRemaining: quantity,
            costPerUnit,
            totalCost
        });

        // Clear form
        clearInputs('inventory-material', 'inventory-quantity', 'inventory-cost');
    } catch (err) {
        console.error(err);
        alert('Error saving inventory');
    }
}

/**
 * Get current inventory ledger
 * @returns {array}
 */
export function getInventoryLedger() {
    return inventoryLedger;
}
