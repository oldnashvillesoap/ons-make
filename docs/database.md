# 🧴 Soap & Cosmetics Business NoSQL Data Model

Designed for Firestore or similar document databases. Supports recipes, inventory (raw + finished), production batches, and cost tracking.

---

## 🗃️ Collections

| Collection             | Purpose |
|------------------------|---------|
| `inventory_items`      | Raw materials and finished products |
| `recipes`              | Formulas for products |
| `batches`              | Production runs with actual ingredients used |
| `inventory_transactions` | Audit log of stock changes |

---

## 📦 `inventory_items/{itemId}`

Represents all items in inventory — raw materials or finished goods.

```json
{
  "name": "Lavender Bar Soap",
  "type": "finished_product",
  "category": "soap",
  "unit": "bars",
  "stock_on_hand": 100,
  "reorder_threshold": 50,
  "cost_per_unit": 1.20,
  "currency": "USD",
  "notes": "Cold process, cured 4 weeks"
}
```

```json
{
  "name": "Lye (NaOH)",
  "type": "raw_material",
  "category": "chemical",
  "unit": "g",
  "stock_on_hand": 2000,
  "reorder_threshold": 500,
  "cost_per_unit": 0.02,
  "currency": "USD",
  "supplier": "ChemCo"
}
```

---

## 📝 `recipes/{recipeId}`

Formulas for making products. Stores estimated costs.

```json
{
  "name": "Lavender Bar Soap",
  "category": "soap",
  "yield_quantity": 12,
  "yield_unit": "bars",
  "notes": "Cold process, cure 4 weeks",
  "ingredients": [
    {
      "item_id": "abc123",
      "name": "Lye",
      "quantity": 120,
      "unit": "g",
      "cost_per_unit": 0.02,
      "line_cost": 2.40
    },
    {
      "item_id": "def456",
      "name": "Olive Oil",
      "quantity": 500,
      "unit": "g",
      "cost_per_unit": 0.01,
      "line_cost": 5.00
    }
  ],
  "estimated_batch_cost": 7.40,
  "estimated_cost_per_unit": 0.62
}
```

---

## 🧪 `batches/{batchId}`

Records actual production runs — ingredients may differ from recipe.

```json
{
  "recipe_id": "abc123",
  "recipe_name": "Lavender Bar Soap",
  "date": "2026-04-20",
  "status": "curing",
  "notes": "Batch #14 — increased olive oil slightly",
  "yield_quantity": 24,
  "yield_unit": "bars",
  "ingredients": [
    {
      "item_id": "abc123",
      "name": "Lye",
      "quantity": 240,
      "unit": "g",
      "cost_per_unit": 0.02,
      "line_cost": 4.80
    },
    {
      "item_id": "def456",
      "name": "Olive Oil",
      "quantity": 1050,
      "unit": "g",
      "cost_per_unit": 0.01,
      "line_cost": 10.50
    }
  ],
  "total_batch_cost": 15.30,
  "cost_per_unit": 0.6375,
  "finished_product_id": "xyz789",
  "finished_product_name": "Lavender Bar Soap",
  "finished_product_quantity": 24,
  "finished_product_unit": "bars"
}
```

---

## 📊 `inventory_transactions/{txId}`

Audit trail of all stock movements.

```json
{
  "type": "deduction",
  "item_id": "abc123",
  "item_name": "Lye",
  "quantity": 240,
  "unit": "g",
  "cost_per_unit": 0.02,
  "total_cost": 4.80,
  "reason": "production",
  "batch_id": "batch789",
  "date": "2026-04-20"
}
```

---

## 💡 Key Design Notes

- **All costs are snapshotted** at time of write — preserves historical accuracy.
- **`inventory_items`** unifies raw + finished goods** — simplifies stock management.
- **Batches capture actuals**, not just recipe estimates — supports adjustments.
- **Transactions are immutable** — full audit trail for inventory changes.
- **Denormalized names** (e.g., `item_name`) avoid extra lookups for common views.
