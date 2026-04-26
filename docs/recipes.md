# Recipes

A recipe defines the formula for a product — the ingredients, quantities, and expected yield. Recipes are the template that batches are built from.

## Browsing Recipes

Use the search box to filter by recipe name, category, or finished product name. The category dropdown narrows results to a single product type.

The table shows each recipe's name, category, linked WIP and finished product, expected yield, number of ingredients, and the estimated batch cost and cost per unit based on current ingredient prices.

Double-click a row to edit.

## Creating a Recipe

Click **New Recipe**.

### Copying from an Existing Recipe

If the new recipe is similar to an existing one, use the **Copy from** field to load another recipe's name, category, yield, notes, and ingredients as a starting point. You can then adjust as needed.

### Basic Fields

**Recipe Name** *(required)* — descriptive name, e.g. "Lavender Bar Soap 100g".

**Category** — the product type this recipe produces (Bar Soap, Bath Salts, Deodorant, Lip Balm, Pet Soap, Shampoo Bar, Sugar Scrub).

**WIP Product** — the inventory item that represents this product in its intermediate state (e.g. the soap loaf before cutting and curing). Selecting a WIP item here allows the app to track stock through the curing stage.

> **Auto-create**: For new recipes, tick the checkbox next to the WIP field to automatically create a WIP inventory item using the recipe name. You can edit the item later.

**Finished Product** — the inventory item that stock is added to when a batch completes. The yield unit is automatically filled from the item's purchase unit.

> **Auto-create**: Same as WIP — tick the checkbox to create the finished product item automatically.

**Yield Quantity** — how many units the recipe produces at scale 1.

**Yield Unit** — auto-filled from the selected finished product, or choose manually.

**Notes** — any production notes, instructions, or reminders.

### Ingredients

Click **Add Ingredient** to add a row. For each ingredient:

- **Item** — search for a raw material by name
- **Qty** — quantity at scale 1
- **Unit** — filled automatically from the item's production unit; read-only
- **Line Cost** — calculated automatically as Qty × item's cost per unit

The **cost summary** at the bottom shows the estimated total batch cost and cost per unit based on current ingredient prices. These update live as you change quantities.

To remove an ingredient, click the × button on its row.

## Editing a Recipe

Open a recipe by double-clicking its row. All fields are editable. Changes to a recipe do not retroactively affect existing batches — batches capture ingredient costs at the time they are recorded.

## Deleting a Recipe

Click **Delete Recipe** at the bottom of the form and confirm. This removes only the recipe; it does not affect batches or inventory items linked to it.

## How Recipe Costs Are Estimated

The estimated cost shown in the recipe list and form uses each ingredient's current `cost per unit` from inventory. Because ingredient prices change over time, this is an estimate — actual batch costs are captured separately when you record a batch.

Cost per unit estimate = total ingredient cost ÷ yield quantity
