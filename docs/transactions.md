# Transactions

Transactions are the complete audit log of every stock movement — both automatic (driven by batch status changes) and manual (recorded directly here).

## Browsing Transactions

Transactions are shown newest first. Use the tabs to filter by **Additions** or **Deductions**, or stay on **All** to see everything.

The search box filters by item name or reason in real time.

The table shows:

| Column | Notes |
|---|---|
| Date | Date and time of the movement |
| Type | Addition (green) or Deduction (red) |
| Item | Inventory item affected |
| Quantity | Amount moved, with unit |
| Cost/Unit | Cost per unit at time of transaction |
| Total Cost | Quantity × Cost per unit |
| Reason | Why the movement occurred |

## Recording a Manual Movement

Click **Record Movement** to open the form. Use this to record:

- **Stock received** from a supplier (Addition)
- **Stock written off** due to damage, spoilage, or sampling (Deduction)
- **Corrections** when actual stock doesn't match the system

### Fields

**Type** — Addition (stock coming in) or Deduction (stock going out).

**Date** — defaults to the current date and time. Adjust if recording a past event.

**Item** — select the inventory item. The unit and cost per unit fields auto-fill from the item's current values.

**Quantity** — how much to add or deduct.

**Unit** — auto-filled from the item; can be adjusted.

**Cost per Unit** — auto-filled from the item's current cost. For additions, entering a cost here triggers a weighted average recalculation of the item's cost per unit. For deductions, this field is for record-keeping only and does not affect the item's cost.

**Total Cost** — calculated automatically as Quantity × Cost per Unit; read-only.

**Reason** — a short description of why the movement is happening. Common reasons include:
- `purchase` — new stock received from a supplier
- `adjustment` — correction to match a physical count
- `spoilage` — stock lost to damage or expiry
- `sample` — stock used for sampling or testing
- `reconciliation` — automatic reason used when you edit an item's stock on hand directly

**Batch ID** — optional link to a specific batch if the movement is related to production but not captured automatically.

## Automatic Transactions

The following transactions are recorded automatically when batch status changes. You do not need to create these manually.

| Trigger | Transaction(s) created |
|---|---|
| Batch → Curing | Deduction for each raw material ingredient; Addition for WIP item |
| Batch → Complete (from Curing) | Deduction for WIP; Addition for finished product |
| Batch → Complete (from In Progress) | Deduction for each raw material; Addition for finished product |
| Batch → In Progress (from Curing) | Addition for each raw material (reversal); Deduction for WIP |
| Batch → Curing (from Complete) | Deduction for finished product; Addition for WIP (reversal) |
| Item stock edited directly | Addition or Deduction with reason "reconciliation" |

## Weighted Average Cost

When an **Addition** is recorded with a cost per unit greater than zero, the item's stored cost per unit is recalculated using a weighted average:

```
new cost = (current stock × current cost + added qty × new cost) / (current stock + added qty)
```

This means the cost per unit in inventory always reflects your blended purchase cost across all stock on hand. Recipe and batch cost estimates will use this updated figure from the next calculation onward.

## Correcting Mistakes

Transactions cannot be edited or deleted. To correct an error:

1. Record an offsetting transaction in the opposite direction with reason "correction".
2. If a batch drove incorrect automatic transactions, move the batch backward in status (which creates reversal transactions) and re-advance it after fixing the source data.
