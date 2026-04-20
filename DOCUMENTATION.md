# ArtisanOS - Documentation

## Overview

ArtisanOS is a web-based production management system designed for small-batch artisan producers (soap, lotion, lip balm, deodorant, etc.). It provides recipe management, inventory tracking with FIFO costing, and production batch planning and execution.

**Technology Stack:**
- Frontend: HTML5, Tailwind CSS, Vanilla JavaScript
- Backend: Firebase (Authentication, Firestore Database)
- Deployment: Static hosting (Firebase Hosting compatible)

---

## System Architecture

### High-Level Flow

```
User Authentication
    ↓
    ├── Recipes Tab: Create and manage product recipes
    ├── Inventory Tab: Log material receipts and track FIFO ledger
    ├── Batches Tab: Plan and execute production batches
    └── Help Tab: Documentation and guidance
```

### Core Concepts

#### 1. **Recipes**
- Store product formulations with ingredient lists
- Ingredients are specified in precise units (grams, pieces)
- System calculates total cost and cost-per-unit based on current inventory prices
- Costs update automatically as new inventory is logged at different prices

#### 2. **Inventory (FIFO Ledger)**
- Each material receipt is logged with quantity, unit, and total cost
- Materials are purchased in bulk units: gallons (gal), pounds (lb), ounces (oz), pieces
- Cost-per-unit is calculated as: Total Cost ÷ Quantity Received
- Ledger is ordered chronologically (oldest first) to support FIFO depletion
- All internal calculations use grams for consistency

#### 3. **Production Batches**
- Each batch has a unique sequential number
- Batches go through two states:
  - **Planned**: Reserved for future production; materials not yet consumed
  - **Executed**: Finalized; materials consumed from inventory using FIFO, costs locked in
- Batches can use recipe ingredients as-is or custom amounts
- Batch execution permanently modifies inventory

#### 4. **Forecasting**
- System projects future material needs from all planned batches
- Alerts warn if planned production exceeds available inventory
- Helps prevent shortages and guides purchasing decisions

---

## Firestore Data Structure

### Collection: `recipes`
```javascript
{
  userId: string,           // Owner of the recipe
  name: string,            // e.g., "Lavender Soap"
  category: string,        // e.g., "Soap", "Lotion"
  yield: string,           // Number of units produced (e.g., "12" bars)
  ingredients: string,     // Newline-separated list: "Ingredient - Amountg" or "Ingredient - 5 pieces"
  createdAt: timestamp
}
```

**Example Ingredients String:**
```
Goat Milk - 50g
Lye - 75g
Coconut Oil - 200g
Essential Oil Blend - 5g
```

### Collection: `inventory`
```javascript
{
  userId: string,              // Owner
  material: string,            // e.g., "Goat Milk"
  unit: string,               // "gal", "lb", "oz", or "piece"
  quantity: number,           // Original quantity received
  quantityRemaining: number,  // Amount still in stock (decreases as batches execute)
  costPerUnit: number,        // Calculated: totalCost / quantity
  totalCost: number,          // Total $ paid for this receipt
  dateReceived: timestamp,    // When material arrived
}
```

**Example:**
```javascript
{
  material: "Goat Milk",
  unit: "gal",
  quantity: 5,
  quantityRemaining: 4.2,
  costPerUnit: 2.40,           // ($12 / 5 gal)
  totalCost: 12.00,
  dateReceived: "2024-04-19"
}
```

### Collection: `batches`
```javascript
{
  userId: string,              // Owner
  batchNumber: number,         // Unique sequential ID (e.g., 1001, 1002, ...)
  recipeId: string,           // Reference to recipes collection
  date: timestamp,            // Planned/executed production date
  notes: string,              // Optional notes (e.g., "Higher fragrance", "Test run")
  customIngredients: string,  // Optional; if set, overrides recipe ingredients
  status: "planned" | "executed",
  totalCost: number,          // Set only when executed; cumulative FIFO cost of materials used
  costPerUnit: number,        // Set only when executed; totalCost / yield
  executedAt: timestamp,      // Set only when executed
  createdAt: timestamp
}
```

---

## Core Algorithms

### 1. Unit Conversion

All inventory quantities are converted to grams for internal calculations:

```javascript
const UNIT_TO_GRAMS = {
    gal: 3785.41,    // 1 gallon = 3,785.41 grams
    lb: 453.592,     // 1 pound = 453.592 grams
    oz: 28.3495,     // 1 ounce = 28.3495 grams
    piece: 1         // Pieces stay as 1 (not converted)
};

function convertToGrams(amount, unit) {
    return amount * (UNIT_TO_GRAMS[unit] || 1);
}
```

### 2. FIFO Cost Calculation

When executing a batch, materials are consumed in the order they were received (oldest first). This calculates the cost:

```javascript
function calculateFifoCost(materialName, amountNeeded, ledger) {
    let remaining = amountNeeded;      // Amount still to consume (in grams)
    let totalCost = 0;
    let materialConsumed = 0;

    // Iterate through ledger (ordered oldest first)
    for (let entry of ledger) {
        if (entry.material.toLowerCase() !== materialName.toLowerCase()) continue;
        if (remaining <= 0) break;

        const availableInGrams = convertToGrams(entry.quantityRemaining, entry.unit);
        const consumeAmount = Math.min(remaining, availableInGrams);

        // Cost = amount consumed × cost per unit
        totalCost += consumeAmount * entry.costPerUnit;
        materialConsumed += consumeAmount;
        remaining -= consumeAmount;
    }

    return {
        canFulfill: remaining <= 0.01,  // Boolean: do we have enough?
        totalCost,                       // Actual cost incurred
        materialConsumed                 // Total grams consumed
    };
}
```

**Example:**
- Material: "Goat Milk"
- Amount needed: 100g
- Ledger state:
  - Entry 1: 5 gal @ $2.40/gal (costPerUnit = 0.000631/g), 2 gal remaining = 7,571 grams
  - Entry 2: 5 gal @ $2.50/gal (costPerUnit = 0.000659/g), 3 gal remaining = 11,356 grams
- Calculation:
  - Consume 100g from Entry 1: 100 × $0.000631 = $0.0631
  - Remaining needed: 0 (fulfilled)
  - **Result:** { canFulfill: true, totalCost: $0.0631 }

### 3. Recipe Cost Calculation

```javascript
function calculateRecipeCost(recipe, ledger) {
    let totalCost = 0;
    const materialCosts = {};

    const ingredients = parseIngredients(recipe.ingredients);
    
    ingredients.forEach(ing => {
        // Convert ingredient amount to grams
        const amountInGrams = convertToGrams(ing.amount, ing.unit);
        
        // Calculate FIFO cost for this ingredient
        const costCalc = calculateFifoCost(ing.name, amountInGrams, ledger);
        
        totalCost += costCalc.totalCost;
        materialCosts[ing.name] = costCalc.totalCost;
    });

    // Divide by yield to get per-unit cost
    const yieldAmount = parseInt(recipe.yield) || 1;
    const costPerUnit = totalCost / yieldAmount;

    return {
        totalCost: totalCost.toFixed(2),
        costPerUnit: costPerUnit.toFixed(2),
        materialCosts
    };
}
```

### 4. Forecasting

Identifies material shortages based on planned batches:

```javascript
function generateForecastingAlerts(recipes, batches, ledger) {
    const alerts = [];
    const plannedBatches = batches.filter(b => b.status === 'planned');

    // Calculate total material needs
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
            const shortage = (needed - available) / UNIT_TO_GRAMS['lb'];
            alerts.push(`Short on ${material}: Need ${shortage.toFixed(2)} more lbs`);
        }
    });

    return alerts;
}
```

---

## User Interface Components

### 1. Recipes Tab
- **Form:** Name, Category, Yield, Ingredients (textarea)
- **Display:** Recipe cards showing:
  - Name, category, yield
  - Ingredient list
  - Total cost (based on current inventory)
  - Cost per unit
  - "Plan Batch" button (jumps to batch modal)

### 2. Inventory Tab
- **Form:** Material name, Unit dropdown, Quantity, Total cost
- **Summary:** Material cards showing:
  - Total quantity remaining
  - Cost per unit
  - Total value in stock
- **Ledger:** Table showing each inventory receipt in FIFO order

### 3. Batches Tab
- **Forecasting Alert:** Displays warnings if planned production exceeds inventory
- **Modal (Plan Batch):**
  - Recipe selection
  - Production date
  - Notes (optional)
  - Custom ingredients (optional)
- **Batch Display:** Cards showing:
  - Batch number, recipe, date
  - Status (Planned or Executed)
  - Ingredients used
  - Execute button (for planned batches)
  - Cost summary (for executed batches)

### 4. Help Tab
- Comprehensive documentation including:
  - System overview
  - Workflow examples
  - FIFO explanation
  - Unit conversion reference
  - Best practices

---

## Workflow Examples

### Example 1: Creating and Costing a Recipe

1. **Create Recipe "Lavender Soap"**
   - Name: "Lavender Soap"
   - Category: "Soap"
   - Yield: "12" (bars)
   - Ingredients:
     ```
     Goat Milk - 50g
     Lye - 75g
     Coconut Oil - 200g
     Essential Oil Blend - 5g
     ```

2. **Log Inventory**
   - Material: "Goat Milk", Unit: "gal", Qty: 5, Total Cost: $12
     - Cost per unit = $12 ÷ 5 = $2.40/gal = $0.000631/g
   - Material: "Lye", Unit: "lb", Qty: 2, Total Cost: $8
     - Cost per unit = $8 ÷ 2 = $4.00/lb = $0.008815/g
   - (etc. for other ingredients)

3. **Recipe Cost Calculation**
   - Goat Milk 50g: 50g × $0.000631/g = $0.0316
   - Lye 75g: 75g × $0.008815/g = $0.6611
   - Coconut Oil 200g: 200g × $0.003527/g = $0.7054
   - Essential Oil 5g: 5g × $0.01/g = $0.05
   - **Batch total cost: $1.50**
   - **Cost per bar: $1.50 ÷ 12 = $0.125 per bar**

### Example 2: Planning and Executing a Batch

1. **Plan Batch**
   - Click "Plan New Batch" on a recipe card
   - Select recipe, date, add notes (e.g., "Test batch with higher lavender")
   - System reserves materials, updates forecasting

2. **Check Forecast**
   - If planning 5 batches of Lavender Soap:
     - Needs: Goat Milk (250g = ~0.066 gal), Lye (375g = ~0.826 lb), etc.
   - System alerts if any material is insufficient

3. **Execute Batch**
   - Click "Execute Batch" button
   - System:
     - Deducts 50g Goat Milk from oldest inventory first (FIFO)
     - Locks in the cost at the FIFO rate
     - Updates `quantityRemaining` in inventory
     - Calculates total batch cost and cost per unit
     - Marks batch as "Executed"

---

## Key Functions Reference

### Parsing & Conversion
- `parseIngredient(ingredientStr)` - Parse single ingredient string
- `parseIngredients(ingredientsText)` - Parse multi-line ingredient list
- `convertToGrams(amount, unit)` - Convert any unit to grams
- `formatDate(timestamp)` - Format timestamp for display

### Inventory & FIFO
- `calculateFifoCost(materialName, amountNeeded, ledger)` - Calculate FIFO cost (read-only)
- `deductMaterialFromInventory(materialName, amountNeeded, ledger)` - Execute FIFO deduction
- `getTotalMaterialQuantity(materialName, ledger)` - Sum available stock
- `getCurrentFifoCostPerUnit(materialName, ledger)` - Get oldest entry's cost

### Recipes & Batches
- `calculateRecipeCost(recipe, ledger)` - Full recipe cost breakdown
- `generateForecastingAlerts(recipes, batches, ledger)` - Identify shortages
- `getNextBatchNumber()` - Fetch next sequential batch ID
- `executeBatch(batchId)` - Execute planned batch (FIFO deduction + cost lock)

### Firebase
- `loadRecipes()` - Listen to recipes collection
- `loadInventory()` - Listen to inventory collection
- `loadBatches()` - Listen to batches collection
- `updateBatchesDisplay()` - Refresh batch UI

---

## Important Notes

### FIFO Order Guarantee
- Inventory ledger is always ordered by `dateReceived` (ascending)
- When executing batches, materials are consumed from the top of the list
- This ensures realistic cost tracking aligned with physical material flow

### Floating Point Precision
- All cost calculations use `toFixed(2)` for currency display
- Internal calculations use full precision
- FIFO matching accounts for floating point errors with `remaining <= 0.01`

### Data Integrity
- Batch execution is atomic within limitations of Firestore
- Material deduction updates are sequential; consider batch operations for large scale
- No rollback mechanism; test thoroughly before executing batches

### User Isolation
- All queries filter by `userId` to ensure users see only their data
- Authentication via Firebase (email/password)

---

## Future Enhancements

- Batch templates (duplicate common batch configs)
- Inventory expiration tracking
- Advanced reporting (cost trends, material usage analysis)
- Photo documentation of batches
- Multi-user collaboration with role-based access
- Ingredient substitution/scaling
- Integration with e-commerce platforms
- Mobile app version

---

## Support & Troubleshooting

### "Cannot execute batch: insufficient [material]"
- **Cause:** Planned batch needs more material than available in inventory
- **Solution:** Log more inventory or adjust custom ingredients before executing

### Recipe costs show as $0
- **Cause:** Ingredient names don't match inventory (case-sensitive)
- **Solution:** Ensure ingredient names in recipes exactly match material names logged in inventory

### Forecasting alerts not showing
- **Cause:** No planned batches, or all planned batches are fulfillable
- **Solution:** Create planned batches or verify material availability

### Batch numbers skip
- **Cause:** Batches deleted; system gets next number from highest existing
- **Solution:** Normal; batch numbers don't reset or reuse

---

## Contact & Support

For issues, feature requests, or questions about ArtisanOS, please check the Help tab in the application or contact your system administrator.
