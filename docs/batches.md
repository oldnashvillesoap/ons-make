# Batches

A batch is a production run — a specific instance of making a recipe on a particular date. Batches track actual ingredients used, costs, and status, and they drive automatic inventory movements.

## Browsing Batches

Use the search box to filter by recipe name or finished product name. The status dropdown filters to a specific stage.

The table shows recipe name, date, age (e.g. "3d", "2wk", "4mo"), status, scale, yield, total batch cost, and cost per unit.

Double-click a row to edit.

## Creating a Batch

Click **New Batch**.

### Fields

**Recipe** *(required)* — search for and select a recipe. This auto-populates the ingredient list at the default scale and pre-selects the recipe's linked finished product.

**Scale** — a multiplier applied to all recipe ingredient quantities. A scale of 2 doubles every ingredient. Minimum 0.25, in increments of 0.25. Defaults to 1.

**Date** — the date the batch was started. Defaults to today.

**Status** — see [Batch Status](#batch-status) below.

**Yield Quantity** — actual quantity produced. Pre-filled from the recipe yield × scale; adjust if the actual yield differs.

**Yield Unit** — unit for the yield quantity.

**Finished Product** — the inventory item that receives stock when the batch completes. Pre-filled from the recipe if set.

**Notes** — production notes or observations.

### Ingredients

When status is **In Progress**, the ingredient list is editable. Rows are pre-populated from the recipe at the chosen scale. You can:

- Adjust quantities to reflect what was actually used
- Add rows for ingredients not in the recipe
- Remove rows for ingredients not used
- Check off each ingredient with the checkbox as you measure and add it

Checking a row marks it as done visually — this is a working aid and is not saved.

Once the batch moves out of In Progress, ingredients are **locked** and cannot be changed. The locked view still shows checkboxes for reference during the finishing stage.

The cost summary shows the total batch cost and cost per unit, updating live as you change quantities.

## Batch Status

Status controls what stage of production a batch is in and triggers automatic inventory movements when it changes.

### In Progress

The batch is being actively prepared. Ingredients are editable. No inventory has moved yet.

### Curing

The batch has been mixed and is in the curing or post-processing stage. **Switching to Curing triggers:**
- Raw material ingredients are deducted from inventory
- The WIP product is added to inventory (if one is linked via the recipe)

Ingredients become locked and cannot be edited.

### Complete

The batch is finished and ready for sale. **Switching to Complete (from Curing) triggers:**
- WIP product is deducted from inventory
- Finished product is added to inventory

If you go directly from **In Progress to Complete** (skipping Curing), the app deducts raw materials and adds finished product in one step — the WIP item is not touched.

### Failed

The batch failed and will not produce usable product. No automatic inventory movement occurs. If materials were already deducted (because the batch had reached Curing), use [Transactions](transactions.md) to manually add them back.

## Status Reversals

You can move a batch backward if you need to correct a mistake:

| From | To | What happens |
|---|---|---|
| Curing | In Progress | Raw materials are added back; WIP is deducted |
| Complete | Curing | Finished product is deducted; WIP is added back |

## Ingredient Locking

Ingredients lock as soon as the batch leaves In Progress. This protects the audit trail — the recorded ingredients are what drove the inventory movements, so they must not change after the fact.

If you need to correct ingredients on a locked batch, move it back to In Progress first (which reverses the inventory movements), make your corrections, then advance the status again.

## Batch Age

The age column in the batch list shows how long ago the batch was started:
- Under a week: shown in days (e.g. "5d")
- Under a month: shown in weeks (e.g. "2wk")
- Under a year: shown in months (e.g. "6mo")
- One year or more: shown in years (e.g. "1yr")

## Cost Calculations

**Total Batch Cost** = sum of all ingredient line costs (quantity × cost per unit at time of batch)

**Cost per Unit** = total batch cost ÷ yield quantity

Ingredient costs are captured at the time you record or last edit the batch, not at the time status changes. If ingredient prices change after you record a batch, the batch cost is not recalculated.

## Deleting a Batch

Open the batch form and click **Delete Batch**. This removes the batch record but does **not** reverse any inventory movements that have already occurred. If the batch had moved past In Progress, manually correct the affected inventory items via Transactions.
