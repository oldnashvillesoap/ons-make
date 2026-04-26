# ONS Make — Data Model

Firestore document database. Supports inventory management, recipes, production batches, and a full stock movement audit trail.

---

## Collections

| Collection | Purpose |
|---|---|
| `inventory_items` | Raw materials, WIP, and finished products |
| `recipes` | Product formulas with estimated costs |
| `batches` | Production runs with actual ingredients and status |
| `inventory_transactions` | Immutable audit log of all stock movements |
| `allowed_users` | Access control — users not in this collection are denied entry |

---

## `inventory_items/{itemId}`

All stock items regardless of type.

```json
{
  "name": "Olive Oil",
  "type": "raw_material",
  "category": "Liquid oils",
  "unit": "gal",
  "production_unit": "g",
  "conversion_factor": 3785,
  "stock_on_hand": 5,
  "reorder_threshold": 1,
  "cost_per_unit": 12.00,
  "currency": "USD",
  "supplier": "BulkOils",
  "notes": ""
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Display name |
| `type` | string | `raw_material`, `wip`, or `finished_product` |
| `category` | string | See categories below |
| `unit` | string | Purchase unit — used for stock tracking and ordering |
| `production_unit` | string | Unit used in recipe ingredients. Defaults to `unit` if omitted |
| `conversion_factor` | number | Production units per purchase unit (e.g. `3785` for gal→g). Defaults to `1` |
| `stock_on_hand` | number | Current quantity on hand |
| `reorder_threshold` | number | Low stock alert triggers when `stock_on_hand <= reorder_threshold` |
| `cost_per_unit` | number | Cost per **purchase** unit in USD. Production unit cost = `cost_per_unit / conversion_factor` |
| `currency` | string | Always `"USD"` |
| `supplier` | string | Optional supplier name |
| `notes` | string | Optional free text |

### Type values

| Value | Meaning |
|---|---|
| `raw_material` | Input ingredient purchased for production |
| `wip` | Work-in-progress — intermediate state during curing or post-processing |
| `finished_product` | Completed good ready for sale |

### Category values

Raw material categories: `Additives`, `Chemicals`, `Colorant`, `Flavoring`, `Fragrance`, `Hard oils`, `Liquids`, `Liquid oils`, `Packaging`, `Preservative`, `Salt`

Product categories: `Bar Soap`, `Bath Salts`, `Deodorant`, `Lip Balm`, `Pet Soap`, `Shampoo Bar`, `Sugar Scrub`

### Unit values

`batch`, `each`, `g`, `gal`, `fl-oz`, `oz`, `lb`

---

## `recipes/{recipeId}`

Product formulas. Costs are estimates based on ingredient prices at time of last save.

```json
{
  "name": "Lavender Bar Soap",
  "category": "Bar Soap",
  "yield_quantity": 12,
  "yield_unit": "each",
  "notes": "Cold process, cure 4 weeks",
  "wip_product_id": "wip001",
  "wip_product_name": "Lavender Bar Soap",
  "finished_product_id": "fin001",
  "finished_product_name": "Lavender Bar Soap",
  "ingredients": [
    {
      "item_id": "ing001",
      "name": "Lye",
      "quantity": 120,
      "unit": "g",
      "production_unit": "g",
      "cost_per_unit": 0.02,
      "line_cost": 2.40
    },
    {
      "item_id": "ing002",
      "name": "Olive Oil",
      "quantity": 500,
      "unit": "g",
      "production_unit": "g",
      "cost_per_unit": 0.0032,
      "line_cost": 1.60
    }
  ],
  "estimated_batch_cost": 4.00,
  "estimated_cost_per_unit": 0.3333
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Recipe name |
| `category` | string | Product category |
| `yield_quantity` | number | Expected output at scale 1 |
| `yield_unit` | string | Unit for yield quantity |
| `notes` | string | Optional production notes |
| `wip_product_id` | string | ID of the linked WIP inventory item |
| `wip_product_name` | string | Denormalized name of the WIP item |
| `finished_product_id` | string | ID of the linked finished product inventory item |
| `finished_product_name` | string | Denormalized name of the finished product |
| `ingredients` | array | List of ingredient objects (see below) |
| `estimated_batch_cost` | number | Sum of ingredient line costs at time of save |
| `estimated_cost_per_unit` | number | `estimated_batch_cost / yield_quantity` |

### Ingredient object (in recipe)

| Field | Description |
|---|---|
| `item_id` | Reference to `inventory_items` |
| `name` | Denormalized item name |
| `quantity` | Quantity at scale 1 |
| `unit` | Production unit of the ingredient |
| `production_unit` | Same as `unit` — explicit copy from inventory item |
| `cost_per_unit` | Cost per production unit at time of save |
| `line_cost` | `quantity × cost_per_unit` |

---

## `batches/{batchId}`

Individual production runs. Ingredients may differ from the recipe to reflect actual usage.

```json
{
  "recipe_id": "rec001",
  "recipe_name": "Lavender Bar Soap",
  "scale": 2,
  "date": "2026-04-20",
  "status": "curing",
  "notes": "Increased olive oil slightly",
  "yield_quantity": 24,
  "yield_unit": "each",
  "ingredients": [
    {
      "item_id": "ing001",
      "name": "Lye",
      "quantity": 240,
      "unit": "g",
      "production_unit": "g",
      "cost_per_unit": 0.02,
      "line_cost": 4.80
    }
  ],
  "ingredients_locked": true,
  "total_batch_cost": 4.80,
  "cost_per_unit": 0.20,
  "finished_product_id": "fin001",
  "finished_product_name": "Lavender Bar Soap",
  "finished_cost_per_unit": 0.20,
  "wip_product_id": "wip001",
  "wip_product_name": "Lavender Bar Soap",
  "wip_quantity": 2,
  "wip_unit": "batch",
  "wip_cost_per_unit": 2.40
}
```

| Field | Type | Description |
|---|---|---|
| `recipe_id` | string | Reference to `recipes` |
| `recipe_name` | string | Denormalized recipe name |
| `scale` | number | Multiplier applied to recipe ingredient quantities |
| `date` | string | Batch start date (`YYYY-MM-DD`) |
| `status` | string | See status values below |
| `notes` | string | Optional production notes |
| `yield_quantity` | number | Actual quantity produced |
| `yield_unit` | string | Unit for yield quantity |
| `ingredients` | array | Actual ingredients used (same shape as recipe ingredients) |
| `ingredients_locked` | boolean | `true` when status is `curing` or `complete` — prevents edits to protect the audit trail |
| `total_batch_cost` | number | Sum of ingredient line costs |
| `cost_per_unit` | number | `total_batch_cost / yield_quantity` |
| `finished_product_id` | string | Reference to finished product inventory item |
| `finished_product_name` | string | Denormalized finished product name |
| `finished_cost_per_unit` | number | `total_batch_cost / yield_quantity` — cost used when adding finished stock |
| `wip_product_id` | string | Reference to WIP inventory item |
| `wip_product_name` | string | Denormalized WIP item name |
| `wip_quantity` | number | WIP quantity added to inventory (equals `scale`) |
| `wip_unit` | string | Always `"batch"` |
| `wip_cost_per_unit` | number | `total_batch_cost / scale` — cost used when adding WIP stock |

### Status values and inventory effects

| Status | Meaning | Inventory movement on transition |
|---|---|---|
| `in_progress` | Being actively prepared | None |
| `curing` | Mixed, in post-processing | Deduct raw materials; add WIP |
| `complete` | Finished and ready for sale | Deduct WIP; add finished product |
| `failed` | Did not produce usable output | None (manual correction required if materials were already deducted) |

**Reversal transitions:**

| From | To | Inventory movement |
|---|---|---|
| `curing` | `in_progress` | Add raw materials back; deduct WIP |
| `complete` | `curing` | Deduct finished product; add WIP back |

---

## `inventory_transactions/{txId}`

Immutable audit log. One document per stock movement. Never updated or deleted.

```json
{
  "type": "deduction",
  "item_id": "ing001",
  "item_name": "Lye",
  "quantity": 240,
  "unit": "g",
  "cost_per_unit": 0.02,
  "total_cost": 4.80,
  "reason": "production",
  "batch_id": "bat001",
  "date": "2026-04-20T14:32:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | `addition` or `deduction` |
| `item_id` | string | Reference to `inventory_items` |
| `item_name` | string | Denormalized item name |
| `quantity` | number | Absolute quantity moved (always positive) |
| `unit` | string | Unit of the quantity |
| `cost_per_unit` | number | Cost per unit at time of transaction |
| `total_cost` | number | `quantity × cost_per_unit` |
| `reason` | string | Short description (e.g. `production`, `purchase`, `reconciliation`, `production reversal`) |
| `batch_id` | string | Optional reference to the batch that triggered this movement |
| `date` | string | ISO 8601 timestamp |

### Automatic transaction reasons

| Reason | Trigger |
|---|---|
| `production` | Raw material deducted when batch moves to curing |
| `wip – batch curing` | WIP item added when batch moves to curing |
| `wip → finished` | WIP deducted when batch moves to complete |
| `production complete` | Finished product added when batch moves to complete |
| `production reversal` | Raw materials returned when batch moves back to in_progress |
| `reversal – uncured` | WIP deducted when batch moves back to in_progress |
| `reversal – uncomplete` | Finished product deducted when batch moves back to curing |
| `reversal – back to curing` | WIP returned when batch moves back to curing |
| `reconciliation` | Stock on hand edited directly on the inventory item |

---

## `allowed_users/{userId}`

Controls who can access the app. The document ID is the Firebase Auth UID.

```json
{}
```

The document only needs to exist — no fields are required. Users whose UID does not have a document in this collection are signed out immediately after authentication.

---

## Design Notes

- **Costs are snapshotted** at time of write — ingredient prices in a recipe or batch reflect what was current when saved, not current market prices.
- **Weighted average costing** — when stock is added with a cost, the item's `cost_per_unit` is recalculated as `(existing_stock × existing_cpu + added_qty × new_cpu) / new_total_stock`.
- **Denormalized names** (`recipe_name`, `item_name`, etc.) avoid extra reads when rendering lists and preserve readable history even if the source item is later renamed or deleted.
- **Transactions are immutable** — mistakes are corrected by recording an offsetting transaction, not by editing.
- **Ingredients locked on status change** — once a batch reaches curing, ingredients cannot be modified because they have already driven inventory movements.
