'use strict';

/**
 * ONS Make — SQLite → Firestore one-time migration
 *
 * Setup:
 *   1. npm install
 *   2. Place your SQLite database file in this folder (or set SQLITE_PATH)
 *   3. Download a Firebase service account key from:
 *      Firebase Console → Project Settings → Service accounts → Generate new private key
 *      Save it as service-account.json in this folder (or set SERVICE_ACCOUNT_PATH)
 *   4. Verify the CONFIG section below matches your SQLite data
 *   5. npm run dry-run   ← prints counts, writes nothing
 *   6. npm run migrate   ← writes to Firestore
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Paths (override via env vars or edit here)
const SQLITE_PATH        = process.env.SQLITE_PATH        || path.join(__dirname, 'ons.sqlite');
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT  || path.join(__dirname, 'service-account.json');

// ONS_MATERIALS.INVENTORYTYPE integer → Firestore type string
const INVENTORY_TYPE_MAP = {
  10: 'raw_material',   // Raw
  20: 'raw_material',   // WIP
  30: 'finished_product', // Finished
  40: 'raw_material',   // MRO
  50: 'raw_material',   // Packing
};
const INVENTORY_TYPE_DEFAULT = 'raw_material';

// ONS_BATCHES.STATUS integer → Firestore status string
const BATCH_STATUS_MAP = {
   0: 'in_progress', // Planned
  10: 'in_progress', // Recipe started
  20: 'curing',      // Recipe finished
  90: 'complete',    // Product finished
};
const BATCH_STATUS_DEFAULT = 'complete';
// ─────────────────────────────────────────────────────────────────────────────

// Init Firebase
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const firestore = admin.firestore();

// Init SQLite (read-only — never touches your source data)
const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Firestore batch writes are capped at 500 ops; this chunks automatically.
async function commitDocs(collectionName, docs) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would write ${docs.length} docs to '${collectionName}'`);
    return;
  }
  const CHUNK = 500;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = firestore.batch();
    for (const { ref, data } of docs.slice(i, i + CHUNK)) {
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

function notDeleted(table) {
  return sqlite.prepare(`SELECT * FROM ${table} WHERE IFNULL(DELETED, 0) = 0`).all();
}

// ─── LOOKUPS ─────────────────────────────────────────────────────────────────

function loadLookups() {
  const units = {};
  for (const row of sqlite.prepare('SELECT ID, NAME FROM ONS_UNITS').all()) {
    units[row.ID] = row.NAME;
  }

  const groups = {};
  for (const row of sqlite.prepare('SELECT ID, NAME FROM ONS_MATERIALGROUPS').all()) {
    groups[row.ID] = row.NAME;
  }

  return { units, groups };
}

// ─── STEP 1: MATERIALS → inventory_items ────────────────────────────────────

async function migrateMaterials(lookups) {
  console.log('\n[1/4] Materials → inventory_items');

  const rows = notDeleted('ONS_MATERIALS');
  const idMap = {}; // SQLite material ID → Firestore doc ID
  const docs  = [];

  for (const row of rows) {
    const ref            = firestore.collection('inventory_items').doc();
    idMap[row.ID]        = ref.id;

    const purchaseUnit   = lookups.units[row.UNIT_INV] || '';
    const productionUnit = lookups.units[row.UNIT_PRD] || purchaseUnit;
    const convFactor     = row.CONV_PRD && row.CONV_PRD !== 0 ? row.CONV_PRD : 1;

    docs.push({
      ref,
      data: {
        name:              row.NAME || '',
        type:              INVENTORY_TYPE_MAP[row.INVENTORYTYPE] ?? INVENTORY_TYPE_DEFAULT,
        category:          lookups.groups[row.MATERIALGROUP] || '',
        unit:              purchaseUnit,
        production_unit:   productionUnit,
        conversion_factor: convFactor,
        stock_on_hand:     row.ONHANDQTY_INV  ?? 0,
        reorder_threshold: 0,
        cost_per_unit:     row.UNITCOST_INV   ?? 0,
        currency:          'USD',
        supplier:          '',
        notes:             '',
      },
    });
  }

  await commitDocs('inventory_items', docs);
  console.log(`  ✓ ${docs.length} items`);
  return idMap;
}

// ─── STEP 2: BILL OF MATERIALS → recipes ────────────────────────────────────

async function migrateRecipes(materialIdMap, lookups) {
  console.log('\n[2/4] Bill of materials → recipes');

  const bomRows    = notDeleted('ONS_BILLOFMATERIAL');
  const allMats    = sqlite.prepare('SELECT * FROM ONS_MATERIALS').all();
  const materialById = Object.fromEntries(allMats.map(m => [m.ID, m]));

  // Group BOM rows by MASTER_REC_ID — each unique MASTER_REC_ID is one recipe,
  // and is also the ONS_MATERIALS.ID of the finished product being made.
  const byMaster = {};
  for (const row of bomRows) {
    if (!byMaster[row.MASTER_REC_ID]) byMaster[row.MASTER_REC_ID] = [];
    byMaster[row.MASTER_REC_ID].push(row);
  }

  const idMap = {}; // SQLite MASTER_REC_ID → Firestore recipe doc ID
  const docs  = [];

  for (const [recipeId, ingredients] of Object.entries(byMaster)) {
    const product  = materialById[recipeId]; // MASTER_REC_ID = product's material ID
    const ref      = firestore.collection('recipes').doc();
    idMap[recipeId] = ref.id;

    const totalCost = ingredients.reduce((s, i) => s + (i.COST ?? 0), 0);

    const mappedIngredients = ingredients.map(ing => {
      const mat      = materialById[ing.MATERIAL];
      const prodUnit = mat
        ? (lookups.units[mat.UNIT_PRD] || lookups.units[mat.UNIT_INV] || '')
        : '';
      const qty      = ing.QTY_PRD ?? 0;
      return {
        item_id:       materialIdMap[ing.MATERIAL] || '',
        name:          mat?.NAME || '',
        quantity:      qty,
        unit:          prodUnit,
        cost_per_unit: qty > 0 ? +((ing.COST ?? 0) / qty).toFixed(6) : 0,
        line_cost:     +(ing.COST ?? 0).toFixed(4),
      };
    });

    docs.push({
      ref,
      data: {
        name:                    product?.NAME || `Recipe ${recipeId}`,
        category:                lookups.groups[product?.MATERIALGROUP] || '',
        // yield_quantity / yield_unit not stored in BOM — fill in the app after import
        yield_quantity:          0,
        yield_unit:              '',
        notes:                   '',
        ingredients:             mappedIngredients,
        estimated_batch_cost:    +totalCost.toFixed(4),
        estimated_cost_per_unit: 0,
      },
    });
  }

  await commitDocs('recipes', docs);
  console.log(`  ✓ ${docs.length} recipes`);
  return idMap;
}

// ─── STEP 3: BATCHES → batches ──────────────────────────────────────────────

async function migrateBatches(materialIdMap, recipeIdMap, lookups) {
  console.log('\n[3/4] Batches → batches');

  const batches      = notDeleted('ONS_BATCHES');
  const batchMats    = notDeleted('ONS_BATCHMATERIALS');
  const allMats      = sqlite.prepare('SELECT * FROM ONS_MATERIALS').all();
  const materialById = Object.fromEntries(allMats.map(m => [m.ID, m]));

  // Group batch materials by MASTER_REC_ID — this is the batch ID (ONS_BATCHES.ID).
  // MASTER_ID is always a fixed record-type constant, not the batch ID.
  const matsByBatch = {};
  for (const bm of batchMats) {
    if (!matsByBatch[bm.MASTER_REC_ID]) matsByBatch[bm.MASTER_REC_ID] = [];
    matsByBatch[bm.MASTER_REC_ID].push(bm);
  }

  const docs = [];

  for (const b of batches) {
    const finishedMat = materialById[b.PRODUCT];

    const ingredients = (matsByBatch[b.ID] || []).map(bm => {
      const mat      = materialById[bm.MATERIAL];
      const prodUnit = mat
        ? (lookups.units[mat.UNIT_PRD] || lookups.units[mat.UNIT_INV] || '')
        : '';
      const qty      = bm.QTY_PRD ?? 0;
      return {
        item_id:       materialIdMap[bm.MATERIAL] || '',
        name:          mat?.NAME || '',
        quantity:      qty,
        unit:          prodUnit,
        cost_per_unit: qty > 0 ? +((bm.COST ?? 0) / qty).toFixed(6) : 0,
        line_cost:     +(bm.COST ?? 0).toFixed(4),
      };
    });

    docs.push({
      ref: firestore.collection('batches').doc(),
      data: {
        recipe_id:                 recipeIdMap[b.RECIPE] || '',
        recipe_name:               materialById[b.RECIPE]?.NAME || b.NAME || '',
        date:                      b.STARTDATE || '',
        status:                    BATCH_STATUS_MAP[b.STATUS] ?? BATCH_STATUS_DEFAULT,
        notes:                     b.NOTES || '',
        yield_quantity:            b.BATCHQTY ?? 0,
        yield_unit:                '', // not stored in SQLite — update in app after import
        ingredients,
        total_batch_cost:          b.BATCHCOST ?? 0,
        cost_per_unit:             b.UNITCOST  ?? 0,
        finished_product_id:       materialIdMap[b.PRODUCT] || '',
        finished_product_name:     finishedMat?.NAME || '',
        finished_product_quantity: b.BATCHQTY ?? 0,
        finished_product_unit:     '',
      },
    });
  }

  await commitDocs('batches', docs);
  console.log(`  ✓ ${docs.length} batches`);
}

// ─── STEP 4: RECEIPT LINE ITEMS → inventory_transactions ────────────────────

async function migrateTransactions(materialIdMap, lookups) {
  console.log('\n[4/4] Receipt line items → inventory_transactions');

  const receiptLines = notDeleted('ONS_RECEIPTMATERIALS');
  const receipts     = sqlite.prepare('SELECT * FROM ONS_RECEIPTS').all();
  const allMats      = sqlite.prepare('SELECT * FROM ONS_MATERIALS').all();
  const receiptById  = Object.fromEntries(receipts.map(r => [r.ID, r]));
  const materialById = Object.fromEntries(allMats.map(m => [m.ID, m]));

  const docs = receiptLines.map(row => {
    const mat     = materialById[row.MATERIAL];
    const receipt = receiptById[row.MASTER_REC_ID];
    const invUnit = lookups.units[mat?.UNIT_INV] || '';
    // QTY_PUR is in purchase units; CONV_INV converts it to inventory units
    const qtyInv  = (row.QTY_PUR ?? 0) * (row.CONV_INV ?? 1);

    return {
      ref: firestore.collection('inventory_transactions').doc(),
      data: {
        type:          'addition',
        item_id:       materialIdMap[row.MATERIAL] || '',
        item_name:     mat?.NAME || '',
        quantity:      +qtyInv.toFixed(4),
        unit:          invUnit,
        cost_per_unit: row.UNITCOST_INV_NEW ?? 0,
        total_cost:    row.ITEM_TOTAL       ?? 0,
        reason:        'purchase',
        batch_id:      '',
        date:          receipt?.CREATED || '',
      },
    };
  });

  await commitDocs('inventory_transactions', docs);
  console.log(`  ✓ ${docs.length} transactions`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('=== DRY RUN — nothing will be written ===\n');
  console.log(`SQLite:   ${SQLITE_PATH}`);
  console.log(`Firebase: ${serviceAccount.project_id}`);

  try {
    const lookups       = loadLookups();
    const materialIdMap = await migrateMaterials(lookups);
    const recipeIdMap   = await migrateRecipes(materialIdMap, lookups);
    await migrateBatches(materialIdMap, recipeIdMap, lookups);
    await migrateTransactions(materialIdMap, lookups);

    console.log('\n✓ Migration complete.');
  } catch (err) {
    console.error('\n✗ Migration failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
