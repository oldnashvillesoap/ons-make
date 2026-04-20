/**
 * Unit Conversion Utilities
 * Convert between different measurement units (gal, lb, oz, pieces, grams)
 */

// Conversion factors to grams
export const UNIT_TO_GRAMS = {
    gal: 3785.41,    // 1 gallon = 3,785.41 grams
    lb: 453.592,     // 1 pound = 453.592 grams
    oz: 28.3495,     // 1 ounce = 28.3495 grams
    piece: 1         // Pieces stay as 1 (not converted)
};

/**
 * Convert a quantity from one unit to grams
 * @param {number} amount - The quantity to convert
 * @param {string} unit - The unit (gal, lb, oz, piece)
 * @returns {number} - Amount in grams (or pieces if unit is 'piece')
 */
export function convertToGrams(amount, unit) {
    return amount * (UNIT_TO_GRAMS[unit] || 1);
}

/**
 * Parse ingredient string to extract name and amount
 * Format: "Ingredient Name - 50g" or "Ingredient Name - 5 pieces"
 * @param {string} ingredientStr - Single ingredient string
 * @returns {object|null} - { name, amount, unit } or null if invalid
 */
export function parseIngredient(ingredientStr) {
    const match = ingredientStr.match(/^(.+?)\s*-\s*(\d+(?:\.\d+)?)\s*([a-z]+)?/i);
    if (!match) return null;
    const name = match[1].trim();
    const amount = parseFloat(match[2]);
    const unit = (match[3] || 'g').toLowerCase();
    return { name, amount, unit };
}

/**
 * Parse all ingredients from a textarea string
 * @param {string} ingredientsText - Multi-line ingredient list
 * @returns {array} - Array of parsed ingredients
 */
export function parseIngredients(ingredientsText) {
    return ingredientsText
        .split('\n')
        .map(line => parseIngredient(line))
        .filter(ing => ing !== null);
}

/**
 * Format a date for display (MM/DD/YYYY)
 * @param {Timestamp|Date} timestamp - Firestore timestamp or Date object
 * @returns {string} - Formatted date string
 */
export function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}
