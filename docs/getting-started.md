# Getting Started

## Signing In

ONS Make uses Google sign-in. Click **Sign in with Google** and choose your account. Access is restricted — if you see "Access denied", ask an admin to add your account.

## Navigation

The sidebar on the left links to each section:

| Section | What it's for |
|---|---|
| Dashboard | At-a-glance overview |
| Inventory | Stock catalog and levels |
| Recipes | Product formulas |
| Batches | Production runs |
| Transactions | Manual stock movements and audit log |

## Key Concepts

### Inventory Types

Every inventory item has one of three types:

- **Raw Material** — ingredients you purchase and use in production (oils, fragrances, packaging, etc.)
- **WIP (Work in Progress)** — an intermediate state representing a batch that has been mixed but not yet finished (e.g. soap loaf before cutting)
- **Finished Product** — completed goods ready for sale

### The Production Flow

```
Recipe → Batch (In Progress) → Batch (Curing) → Batch (Complete)
                                                       ↓
                               Raw materials deducted, finished product added
```

When you move a batch from **In Progress** to **Curing**, raw material stock is automatically deducted and WIP stock is added. When you move it to **Complete**, WIP is deducted and finished product stock is added.

### Units and Conversion

Items have a **purchase unit** (how you buy them, e.g. `gal`) and an optional **production unit** (how they appear in recipes, e.g. `g`). The **conversion factor** tells the app how many production units are in one purchase unit (e.g. 3785 g per gallon). This keeps recipe costing accurate without requiring you to enter everything in the same unit.

### Cost Tracking

The app uses **weighted average costing**. When you add stock with a cost, the new average cost per unit is calculated from your existing stock and the new purchase. This average is used for all cost estimates in recipes and batches.
