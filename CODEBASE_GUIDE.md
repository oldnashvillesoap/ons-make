# ArtisanOS - Codebase Guide

This document provides an overview of the code structure and architecture for developers maintaining or extending ArtisanOS.

## Code Organization

The application is a single-file web app (`index.html`) containing:
1. HTML structure and forms
2. Tailwind CSS styling (via CDN)
3. Firebase integration
4. Complete business logic in vanilla JavaScript

### File Size & Scope
- ~1000 lines of JavaScript
- ~300 lines of HTML/forms
- ~50 lines of CSS (custom + Tailwind)

### Why Single File?
- Easy to deploy (static hosting)
- Self-contained (no build process)
- Simple to version control
- No dependencies except Firebase SDK and Tailwind CSS

---

## JavaScript Architecture

The JavaScript is organized into logical sections with clear comments:

```
1. CONFIGURATION
   - Firebase initialization
   - Environment setup

2. UNIT CONVERSION CONSTANTS
   - Conversion factors (gal, lb, oz to grams)

3. UTILITY FUNCTIONS: UNIT CONVERSIONS & HELPERS
   - convertToGrams()
   - parseIngredient()
   - parseIngredients()
   - formatDate()
   - getNextBatchNumber()

4. INVENTORY MANAGEMENT: FIFO COST CALCULATIONS
   - getCurrentFifoCostPerUnit()
   - getTotalMaterialQuantity()
   - calculateFifoCost() [read-only]
   - deductMaterialFromInventory() [mutating]

5. RECIPE COST CALCULATION
   - calculateRecipeCost()

6. FORECASTING & ALERTS
   - generateForecastingAlerts()

7. UI STATE & NAVIGATION
   - Tab switching logic
   - Global state variables

8. AUTHENTICATION
   - Login/logout handlers
   - Auth state listeners

9. RECIPES: LOAD, DISPLAY, & COST CALCULATION
   - loadRecipes()
   - Recipe card rendering
   - Recipe form submission

10. INVENTORY: LOAD, DISPLAY, & MANAGEMENT
    - loadInventory()
    - updateInventoryDisplay()
    - Inventory form submission

11. BATCHES: LOAD, DISPLAY, PLAN & EXECUTE
    - loadBatches()
    - updateBatchesDisplay()
    - Batch modal functions
    - executeBatch()
```

Each section is marked with clear header comments (`// ============= ... =============`).

---

## Key Data Structures

### Global State
```javascript
let currentUser = null;           // Current authenticated user
let allRecipes = [];              // Array of recipe objects
let allBatches = [];              // Array of batch objects
let inventoryLedger = [];         // Array of inventory ledger entries (FIFO order)
```

These are kept in sync with Firestore via `onSnapshot()` listeners.

### Recipe Object
```javascript
{
  id: string,              // Firestore doc ID
  name: string,
  category: string,
  yield: string,
  ingredients: string,     // Newline-separated: "Name - Amountg"
  userId: string,
  createdAt: Timestamp
}
```

### Inventory Entry
```javascript
{
  docId: string,              // Firestore doc ID
  material: string,
  unit: "gal" | "lb" | "oz" | "piece",
  quantity: number,
  quantityRemaining: number,  // Updated as batches consume
  costPerUnit: number,        // Calculated: totalCost / quantity
  totalCost: number,
  userId: string,
  dateReceived: Timestamp
}
```

### Batch Object
```javascript
{
  docId: string,
  batchNumber: number,
  recipeId: string,
  date: Timestamp,
  notes: string,
  customIngredients: string,  // Optional override
  status: "planned" | "executed",
  totalCost: number,          // Only if executed
  costPerUnit: number,        // Only if executed
  userId: string,
  createdAt: Timestamp,
  executedAt: Timestamp       // Only if executed
}
```

---

## Function Reference & Dependencies

### Pure Functions (No Side Effects)

#### `convertToGrams(amount, unit) → number`
- **Input**: amount (number), unit (string: "gal", "lb", "oz", "piece")
- **Output**: amount in grams
- **Usage**: Convert inventory units to grams for recipe matching
- **Example**: `convertToGrams(5, "lb")` → 2267.96

#### `parseIngredient(ingredientStr) → {name, amount, unit} | null`
- **Input**: single ingredient string (e.g., "Lye - 50g")
- **Output**: parsed object or null if invalid format
- **Regex Pattern**: `/^(.+?)\s*-\s*(\d+(?:\.\d+)?)\s*([a-z]+)?/i`
- **Usage**: Parse individual ingredient lines

#### `parseIngredients(ingredientsText) → Array`
- **Input**: multi-line ingredient string (textarea value)
- **Output**: array of parsed ingredient objects
- **Usage**: Parse all ingredients from recipe/batch
- **Filters**: Removes null entries (invalid lines)

#### `calculateFifoCost(materialName, amountNeeded, ledger) → {canFulfill, totalCost, materialConsumed}`
- **Input**: material name (string), amount in grams (number), ledger array
- **Output**: cost breakdown object
- **Side Effects**: NONE (read-only)
- **Usage**: Check if batch can be executed and calculate cost
- **Key Logic**:
  ```javascript
  for (let entry of ledger) {
    if (entry.material matches && remaining > 0) {
      consume min(remaining, available)
      accumulate cost
    }
  }
  return { canFulfill: remaining <= 0.01, totalCost, materialConsumed }
  ```

#### `getTotalMaterialQuantity(materialName, ledger) → number`
- **Input**: material name (string), ledger array
- **Output**: total quantity in grams
- **Usage**: Check available stock before batch execution
- **Logic**: Sum of quantityRemaining for all matching material entries

#### `calculateRecipeCost(recipe, ledger) → {totalCost, costPerUnit, materialCosts, ingredients}`
- **Input**: recipe object, ledger array
- **Output**: cost breakdown
- **Usage**: Displayed on recipe cards; updates as prices change
- **Logic**:
  1. Parse recipe ingredients
  2. For each ingredient, calculate FIFO cost
  3. Sum to get total cost
  4. Divide by yield for per-unit cost

#### `formatDate(timestamp) → string`
- **Input**: Firestore timestamp or Date object
- **Output**: formatted string (MM/DD/YYYY)
- **Usage**: Display readable dates in UI

#### `generateForecastingAlerts(recipes, batches, ledger) → Array<string>`
- **Input**: all recipes, all batches, inventory ledger
- **Output**: array of alert messages
- **Usage**: Display forecasting warnings on batch tab
- **Logic**:
  1. Find all planned batches
  2. Calculate total material needs
  3. Compare to available inventory
  4. Generate alert for each shortfall

### Async Functions with Side Effects

#### `deductMaterialFromInventory(materialName, amountNeeded, ledger) → Promise`
- **Input**: material name, amount in grams, ledger array
- **Side Effects**: 
  - Modifies ledger array in place
  - Updates Firestore documents
- **Usage**: Only during batch execution
- **Important**: Must be called AFTER checking canFulfill
- **Logic**:
  1. Iterate through ledger (FIFO)
  2. For each entry, consume min(remaining, available)
  3. Update quantityRemaining in Firestore
  4. Continue until fulfilled

#### `getNextBatchNumber() → Promise<number>`
- **Input**: none (uses auth.currentUser)
- **Output**: next batch number
- **Side Effects**: Firestore query
- **Usage**: Get unique sequential batch ID
- **Logic**:
  1. Query batches ordered by batchNumber descending
  2. Get highest existing number
  3. Return +1

#### `executeBatch(batchId) → Promise`
- **Input**: batch document ID
- **Side Effects**: 
  - Deducts materials from inventory
  - Updates batch status and costs in Firestore
- **Usage**: Called when "Execute Batch" button clicked
- **Key Steps**:
  1. Get batch and recipe
  2. Parse ingredients (custom or recipe)
  3. Check canFulfill for each material
  4. Deduct materials using FIFO
  5. Calculate total and per-unit cost
  6. Update batch document
  7. Show alert with results

### Firebase Data Listeners

#### `loadRecipes() → void`
- **Listener**: onSnapshot on recipes collection (user-filtered)
- **Order**: orderBy("createdAt", "desc")
- **Trigger**: Automatic on auth change
- **Updates**: allRecipes global, triggers recipe card rendering

#### `loadInventory() → void`
- **Listener**: onSnapshot on inventory collection (user-filtered)
- **Order**: orderBy("dateReceived", "asc") - FIFO order
- **Trigger**: Automatic on auth change
- **Updates**: inventoryLedger global, calls updateInventoryDisplay()

#### `loadBatches() → void`
- **Listener**: onSnapshot on batches collection (user-filtered)
- **Order**: orderBy("date", "desc")
- **Trigger**: Automatic on auth change, when batch tab open
- **Updates**: allBatches global, calls updateBatchesDisplay()

### UI Update Functions

#### `updateInventoryDisplay() → void`
- **Input**: uses global inventoryLedger
- **Output**: updates DOM (inventory summary and ledger table)
- **Called By**: loadInventory listener, form submissions
- **Logic**:
  1. Group inventory by material
  2. Calculate totals per material
  3. Render summary cards
  4. Render ledger rows

#### `updateBatchesDisplay() → void`
- **Input**: uses allRecipes, allBatches, inventoryLedger
- **Output**: updates DOM (batch cards, forecasting alert)
- **Called By**: loadBatches listener, batch form submissions
- **Logic**:
  1. Populate recipe dropdown
  2. Generate and display forecasting alerts
  3. Render batch cards
  4. Attach event listeners

---

## Common Patterns

### Real-Time Data Sync
```javascript
onSnapshot(query, (snapshot) => {
  globalArray = [];
  snapshot.forEach((doc) => {
    globalArray.push({ ...doc.data(), docId: doc.id });
  });
  updateDisplay();
});
```

This pattern is used for recipes, inventory, and batches. Changes in Firestore instantly update the UI.

### User-Filtered Queries
```javascript
const q = query(
  collection(db, "inventory"),
  where("userId", "==", auth.currentUser.uid),
  orderBy("dateReceived", "asc")
);
```

All queries include `where("userId", "==", auth.currentUser.uid)` to ensure data isolation.

### Cost Calculations
All cost calculations follow this pattern:
1. Parse ingredients
2. For each ingredient, call calculateFifoCost()
3. Sum costs
4. Divide by yield

This is repeated in:
- Recipe cost display
- Batch execution

### Form Reset
After successful form submission:
```javascript
document.getElementById('field-id').value = '';
document.getElementById('field-id-2').value = '';
```

Used for recipes, inventory, and batch modals.

### Modal Management
```javascript
function openBatchModal() {
  batchModal.classList.add('active');
}

function closeBatchModal() {
  batchModal.classList.remove('active');
  // Reset form fields
}
```

CSS:
```css
.modal-overlay { display: none; }
.modal-overlay.active { display: flex; }
```

---

## Common Gotchas & Edge Cases

### 1. Floating Point Precision
- **Problem**: 0.1 + 0.2 !== 0.3 in JavaScript
- **Solution**: Round final costs with `toFixed(2)`
- **Used In**: calculateFifoCost, calculateRecipeCost, batch execution
- **Also**: When checking canFulfill, use `remaining <= 0.01` not `remaining === 0`

### 2. Case Sensitivity in Material Names
- **Problem**: "Goat Milk" in recipe ≠ "goat milk" in inventory
- **Solution**: All comparisons use `.toLowerCase()`
- **Example**: `entry.material.toLowerCase() === materialName.toLowerCase()`

### 3. Unit Conversion Ordering
- **Problem**: Must always convert to grams, never back
- **Solution**: 
  - Inventory quantities stay in original units
  - Convert to grams for calculations
  - Never store grams in Firestore
- **Example**: Store 5 lbs, convert to 2267.96g when calculating

### 4. Ledger Order for FIFO
- **Critical**: Inventory must be ordered by dateReceived ASC
- **If Wrong**: FIFO costs will be incorrect
- **Check**: `orderBy("dateReceived", "asc")` in all inventory queries

### 5. Async Batch Execution
- **Problem**: Multiple inventory updates in deductMaterialFromInventory
- **Current**: Sequential updates with await
- **Future**: Consider batch writes for large operations
- **Watch For**: Partial updates if execution fails mid-loop

### 6. Ingredient Parsing Format
- **Required Format**: "Ingredient Name - Amount[Unit]"
- **Examples**: "Lye - 50g", "Pieces - 12 pieces", "Oil - 200"
- **If Missing**: parseIngredient returns null, filtered out
- **Edge Case**: Amount can have decimals (50.5g) but must have dash separator

### 7. Modal State
- **Problem**: If user opens/closes modal without submitting
- **Solution**: closeBatchModal() resets all form fields
- **Watch For**: Old data showing if not reset

### 8. Authentication State
- **Pattern**: onAuthStateChanged triggers initial data loads
- **Issue**: If called during startup, currentUser might be null
- **Solution**: Guards in all functions: `if (!auth.currentUser.uid) return`

---

## Testing Checklist

### Unit Logic
- [ ] convertToGrams: all unit types
- [ ] parseIngredient: valid and invalid formats
- [ ] calculateFifoCost: exact amount, shortage, multiple entries
- [ ] calculateRecipeCost: zero cost, multiple ingredients

### Integration
- [ ] Create recipe → appears in dropdown
- [ ] Log inventory → appears in summary and ledger
- [ ] Create batch → appears in list
- [ ] Forecasting alerts → show when shortage exists
- [ ] Execute batch → inventory decreases, batch shows cost

### Edge Cases
- [ ] Empty ingredient → handled gracefully
- [ ] Duplicate material names → works with case-insensitive matching
- [ ] Very large numbers → toFixed(2) prevents display overflow
- [ ] No inventory → recipe shows $0 cost
- [ ] Insufficient material → batch execution blocked

---

## Performance Considerations

### Current
- Real-time listeners on all collections
- No batching of FIFO deductions
- All data loaded into memory
- No pagination or lazy loading

### Scalability Limits
- **Recipes**: 100+ handled easily
- **Inventory Entries**: 1000+ still responsive
- **Batches**: 500+ reasonable; FIFO calculations stay fast
- **Queries**: Per-user filtering keeps result sets small

### Optimization Ideas (Future)
- Lazy load batches (pagination)
- Batch Firestore writes in batch()
- Add Firestore indexes for common queries
- Cache recipe costs (update on inventory change)
- Virtual scroll for large ledgers

---

## Adding New Features

### Adding a New Field to Recipe
1. Add form input in HTML (recipes section)
2. Extract value in save-recipe click handler
3. Add field to addDoc() call
4. Display field in recipe card rendering

### Adding a New Calculation
1. Create pure function in appropriate section
2. Add tests for edge cases
3. Call from relevant display function
4. Update Help tab if user-visible

### Adding a New Tab
1. Create HTML tab button and content div
2. Add tab-content class
3. Create load function with onSnapshot
4. Attach click handler to tab button

### Adding Material Units
1. Add to UNIT_TO_GRAMS object
2. Add to inventory-unit select in HTML
3. Test conversion calculations
4. Update Help tab documentation

---

## Debugging Tips

### Check Real-Time Data
Open browser DevTools (F12), go to Console, type:
```javascript
console.log('Recipes:', allRecipes);
console.log('Inventory:', inventoryLedger);
console.log('Batches:', allBatches);
```

### Check FIFO Calculation
```javascript
const cost = calculateFifoCost('Goat Milk', 100, inventoryLedger);
console.log(cost);
```

### Check Recipe Cost
```javascript
const recipe = allRecipes[0];
const cost = calculateRecipeCost(recipe, inventoryLedger);
console.log(cost);
```

### Check Firestore Connection
```javascript
console.log('Current User:', auth.currentUser);
// Should show user object, not null
```

### Monitor Firebase Calls
- Open DevTools Network tab
- Look for firestore.googleapis.com requests
- Check response status and data

---

## Code Style Conventions

### Naming
- `camelCase` for variables and functions
- `UPPER_CASE` for constants
- Descriptive names: `materialNeeded` not `m`
- Prefixes: `is*` for booleans, `get*` for accessors

### Comments
- Section headers: `// ============= SECTION NAME =============`
- Function JSDoc: `/** description ... */`
- Inline comments: `//` on separate line above code
- Skip obvious comments ("increment counter")

### Formatting
- 4-space indentation (consistent in HTML file)
- Lines under 100 characters when possible
- Space after `if`, `for`, `function`
- No trailing semicolons in some places (Tailwind style)

### Error Handling
- No try-catch in most places (Firebase handles)
- Validation before operations (canFulfill check)
- User alerts for failures
- Console logging for debugging

---

## Future Architecture

### If Growing Beyond Single File
Consider splitting into:
- `core/calculations.js` - FIFO, costs, conversions
- `ui/recipes.js` - Recipe tab logic
- `ui/inventory.js` - Inventory tab logic
- `ui/batches.js` - Batch tab logic
- `firebase/db.js` - Firestore queries and listeners
- `utils/formatting.js` - Date, currency, display helpers

### Build Process
If adding build step:
- Webpack or Vite for bundling
- Minification for production
- Source maps for debugging
- Environment variable handling for Firebase config

### Testing Framework
Recommend Jest or Vitest for:
- Unit tests for calculations
- Firestore mock for database tests
- DOM testing for UI updates

---

## References

- **Firebase Docs**: https://firebase.google.com/docs
- **Firestore Guide**: https://firebase.google.com/docs/firestore
- **JavaScript FIFO Pattern**: Common in inventory systems
- **Tailwind CSS**: https://tailwindcss.com

---

**Last Updated**: April 2024  
**Maintainer Notes**: Code is intentionally structured for single-file clarity and ease of deployment. Consider refactoring only if complexity significantly increases.
