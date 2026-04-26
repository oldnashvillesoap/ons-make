# Dashboard

The dashboard gives you a quick overview of your business without needing to dig into individual records.

## Inventory Value Cards

The top row shows the total stock value (quantity × cost per unit) for each inventory type:

- **Raw Materials** — value of all ingredients on hand
- **WIP** — value of stock currently in the curing/finishing stage
- **Finished Goods** — value of completed products ready for sale
- **Low Stock Items** — count of items at or below their reorder threshold (red if any exist)
- **Active Batches** — batches currently In Progress or Curing

## Low Stock Alerts

Items are flagged as low stock when `stock on hand ≤ reorder threshold`. They appear in two separate tables — one for Raw Materials and one for Finished Products — sorted by quantity on hand (lowest first), then alphabetically.

If all levels are healthy, the tables show a "None" message.

To resolve a low stock alert, either:
- Record an **addition** in [Transactions](transactions.md) when you receive a delivery
- Adjust the **reorder threshold** on the item if the alert level is wrong

## Recent Batches

The last 5 batches sorted by date, showing recipe name, date, status, yield, and cost per unit. This is a read-only summary — click **Batches** in the sidebar to view and edit the full list.
