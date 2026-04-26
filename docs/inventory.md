# Inventory

The Inventory section is your catalog of all stock items — raw materials you buy, WIP states created during production, and finished products you sell.

## Browsing Inventory

Use the tabs to filter by type: **All**, **Raw Materials**, **WIP**, **Finished Products**.

The search box filters by name, category, or supplier in real time.

The table shows:

| Column | Notes |
|---|---|
| Name | Item name |
| Type | Raw Material, WIP, or Finished Product |
| Category | Grouping within the type |
| On Hand | Current stock level — shown in red if at or below reorder threshold |
| Reorder At | Threshold that triggers a low stock alert |
| Cost | Cost per purchase unit; a second line shows cost per production unit if a conversion is set |
| Supplier | Optional |

Double-click any row, or click the edit button, to open the item form.

## Adding an Item

Click **Add Item** to open the form.

### Fields

**Name** *(required)* — a clear, unique name makes searching easier.

**Type** — sets which category list appears and how the item behaves in production:
- Raw Material
- WIP
- Finished Product

**Category** — used for filtering and grouping. Raw material categories include Additives, Chemicals, Colorant, Flavoring, Fragrance, Hard oils, Liquids, Liquid oils, Packaging, Preservative, and Salt. Product categories include Bar Soap, Bath Salts, Deodorant, Lip Balm, Pet Soap, Shampoo Bar, and Sugar Scrub.

**Purchase Unit** — the unit you buy the item in (g, oz, lb, gal, fl-oz, each, batch).

**Production Unit** *(optional)* — the unit used in recipes. Leave blank to use the same unit as Purchase Unit.

**Conversion Factor** — how many production units are in one purchase unit. Only relevant if Production Unit differs from Purchase Unit. Example: if you buy in gallons but recipes use grams, set this to 3785.

**Stock on Hand** — current quantity. Setting this when creating an item does not record a transaction.

**Reorder Threshold** — when stock falls to or below this number, the item appears in low stock alerts.

**Cost per Unit** — cost per purchase unit in USD. This is updated automatically by the weighted average calculation when you add stock via a transaction.

**Supplier** *(optional)* — supplier name for reference.

**Notes** *(optional)* — any other details.

## Editing an Item

Open the item form by double-clicking a row or clicking the edit button.

All fields are editable. If you change **Stock on Hand**, the app automatically records a reconciliation transaction in the audit log to account for the difference.

## Deleting an Item

Click the delete button on a row and confirm. This permanently removes the item. It does not remove historical transactions that reference the item.

## Categories Reference

### Raw Material Categories
Additives · Chemicals · Colorant · Flavoring · Fragrance · Hard oils · Liquids · Liquid oils · Packaging · Preservative · Salt

### Product Categories
Bar Soap · Bath Salts · Deodorant · Lip Balm · Pet Soap · Shampoo Bar · Sugar Scrub
