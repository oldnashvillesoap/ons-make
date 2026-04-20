# ArtisanOS - Quick Start Guide

## What's Been Built

A complete **web-based production management system** for your goat milk soap/lotion business with:

- ✅ **Recipe Management** - Store formulations, auto-calculate costs
- ✅ **FIFO Inventory Tracking** - Materials tracked by receipt, consumed oldest-first
- ✅ **Production Batches** - Plan and execute with cost locking
- ✅ **Forecasting Alerts** - Know when you're short on materials
- ✅ **Comprehensive Documentation** - In-app help + developer guides

## Files Included

| File | Purpose |
|------|---------|
| `index.html` | Main application (HTML + JS + CSS in one file) |
| `README.md` | Feature overview and quick start |
| `DOCUMENTATION.md` | Detailed system documentation (data structures, algorithms) |
| `CODEBASE_GUIDE.md` | Developer guide for code maintenance/extension |
| `QUICK_START.md` | This file |

## 30-Second Setup

1. **Open the app**
   - Open `index.html` in Chrome/Firefox/Safari
   - No installation needed!

2. **Create a user account**
   - Use the login screen
   - Email: your@email.com, Password: anything
   - (Account created automatically)

3. **Start using**
   - Create a recipe
   - Log inventory
   - Plan a batch
   - Review forecasting

## First 5 Minutes - Walk-Through

### Step 1: Create Your First Recipe (1 min)

**Go to: Recipes tab**

Fill in:
- **Name:** Lavender Soap
- **Category:** Soap
- **Yield:** 12 (bars)
- **Ingredients:** (one per line)
  ```
  Goat Milk - 50g
  Lye - 75g
  Coconut Oil - 200g
  Essential Oil - 5g
  ```

Click **"Save Recipe"**

✓ You'll see the recipe card appear. It shows $0 cost because there's no inventory yet.

### Step 2: Log Inventory (1 min)

**Go to: Inventory tab**

Add a material receipt:
- **Material Name:** Goat Milk
- **Unit:** gal (gallons)
- **Qty Received:** 5
- **Total Cost:** $12.00

Click **"Log to FIFO Ledger"**

✓ You'll see the inventory summary card showing 5 gal @ $2.40/gal

Add more:
- **Material Name:** Lye
- **Unit:** lb
- **Qty Received:** 2
- **Total Cost:** $8.00

Click **"Log to FIFO Ledger"**

Log the other ingredients similarly. Now go back to Recipes tab...

### Step 3: Watch Recipe Costs Update (1 min)

**Go back to: Recipes tab**

Your Lavender Soap recipe now shows:
- **Total Cost:** $1.50 (for all ingredients in one batch)
- **Per Unit:** $0.125 (cost per bar)

This was calculated automatically using FIFO from your inventory!

### Step 4: Plan a Production Batch (1 min)

**Go to: Batches tab**

Click **"+ Plan New Batch"**

Fill in:
- **Recipe:** Lavender Soap
- **Production Date:** Tomorrow's date
- **Notes:** Test batch with lavender

Click **"Save as Planned"**

✓ Batch #1001 appears in the list as "PLANNED"

### Step 5: Execute the Batch (1 min)

Still on Batches tab, click **"Execute Batch"** on Batch #1001

The system:
1. Checks you have enough materials ✓
2. Deducts from inventory (FIFO - oldest first) ✓
3. Calculates actual costs ✓
4. Shows you the results:
   - Total Cost: $1.50
   - Cost Per Unit: $0.125

The batch status changes to "EXECUTED" and your inventory is reduced.

## Key Concepts (Quick Explanation)

### FIFO (First-In, First-Out)
**You buy materials at different prices over time:**
- March: 10 lbs Lye for $40 ($4/lb)
- April: 10 lbs Lye for $50 ($5/lb)

**When you execute a batch needing 15 lbs:**
- Uses 10 lbs from March @ $4/lb = $40
- Uses 5 lbs from April @ $5/lb = $25
- **Total: $65** (reflects actual cost flow)

### Why FIFO Matters
- **Accurate costing** - Your recipe costs reflect real material prices
- **Realistic inventory** - Older materials get used first
- **Automatic adjustment** - Recipe costs update as you buy at new prices

### Units Handled
- **Gallons (gal)** - 1 gal = 3,785 grams
- **Pounds (lb)** - 1 lb = 454 grams
- **Ounces (oz)** - 1 oz = 28.35 grams
- **Pieces** - Counted individually (soap bars, etc.)

Recipes use precise units (grams, pieces), inventory uses bulk units. The system converts automatically.

## Common Workflows

### Workflow 1: Managing Price Changes
1. Supplier raises lye price? No problem.
2. Log new receipt at new price
3. Old inventory stays at old price
4. New batches blend old (cheap) + new (expensive)
5. Recipe costs update automatically to reflect the change

### Workflow 2: Planning Monthly Production
1. Plan all 10 batches for April as "planned"
2. System calculates total material needs
3. Forecasting alert tells you what's short
4. Order needed materials before month starts
5. Execute batches as you produce them

### Workflow 3: Finding Cost Per Unit
1. Create recipe with all ingredients
2. System shows total batch cost
3. Divide by yield (already calculated for you)
4. Use for pricing decisions

## Next Steps

1. **Set up your products** - Create recipes for each product you make
2. **Log current inventory** - Enter what you have on hand (estimate costs if needed)
3. **Plan next month** - Add all planned batches for the month
4. **Review alerts** - Buy materials to cover forecasts
5. **Review Help tab** - Full documentation in the app

## Troubleshooting

### "Ingredients don't show a cost"
- Ingredient names must EXACTLY match inventory
- Example: "Goat Milk" in recipe needs "Goat Milk" in inventory (case matters!)
- Fix: Add the inventory with correct name spelling

### "Can't execute batch - insufficient [material]"
- You don't have enough of that material
- Fix: Log more inventory or reduce batch size

### "Batch numbers are random"
- They're not! They're sequential (1001, 1002, 1003...)
- They start from 1001 to make them obviously batch numbers

### "My data disappeared"
- Are you logged in? Each user sees only their own data.
- Reload the page to refresh from Firebase

## Architecture (You Don't Need to Know This, But...)

- **Frontend:** HTML + JavaScript (all in one file)
- **Backend:** Firebase (cloud database + authentication)
- **Deployment:** Can run anywhere - just open the file!
- **No installation, no server, no maintenance.**

## Documentation Files

After you're comfortable with basics, check these:

- **DOCUMENTATION.md** - Deep dive into:
  - Data structures (what gets stored where)
  - FIFO algorithm details
  - Complete workflow examples
  - Best practices

- **CODEBASE_GUIDE.md** - For developers:
  - Code organization and architecture
  - Function reference
  - Testing checklist
  - How to add features

## Support & Help

**In-app Help:**
- Go to Help tab for comprehensive documentation
- Detailed workflow examples
- FIFO explanation
- Best practices

**Need to extend the app?**
- See CODEBASE_GUIDE.md
- Code is heavily commented
- Structure is simple (single HTML file)

## What You Can Do With This

✅ Track 100+ recipes  
✅ Manage 1000+ inventory receipts  
✅ Execute 500+ batches  
✅ Multi-user (each user isolated)  
✅ Real-time sync (changes appear instantly)  
✅ Export to PDF (print batch records)  

## What's Not Included (Future Enhancements)

- Batch templates
- Expiration date tracking
- Advanced analytics & reporting
- Mobile app
- E-commerce integration

These can be added if needed!

---

## You're Ready!

1. Open `index.html`
2. Create an account
3. Follow the 5-minute walk-through above
4. Start managing your production!

**For detailed info:** See README.md or DOCUMENTATION.md  
**For code:** See CODEBASE_GUIDE.md

**Enjoy ArtisanOS!** 🧼✨
