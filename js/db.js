import { state } from './state.js';

let db;
export function setDb(instance) { db = instance; }

export async function getCollection(name) {
  try {
    const snap = await db.collection(name).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Load error:', name, err);
    return [];
  }
}

export async function addDoc(col, data) {
  const ref = await db.collection(col).add(data);
  return ref.id;
}

export async function updateDoc(col, id, data) {
  await db.collection(col).doc(id).update(data);
}

export async function deleteDoc(col, id) {
  await db.collection(col).doc(id).delete();
}

export async function adjustStock(itemId, delta) {
  if (!itemId || delta === 0) return;
  await db.collection('inventory_items').doc(itemId).update({
    stock_on_hand: firebase.firestore.FieldValue.increment(+delta),
  });
}

export async function addStockWeighted(itemId, qty, costPerUnit) {
  if (!itemId || !(qty > 0)) return;
  const item         = state.inventory.find(i => i.id === itemId);
  const currentStock = Math.max(0, item?.stock_on_hand ?? 0);
  const currentCpu   = item?.cost_per_unit ?? 0;
  const newStock     = currentStock + qty;
  const update = { stock_on_hand: firebase.firestore.FieldValue.increment(+qty) };
  if (costPerUnit > 0) {
    update.cost_per_unit = +((currentStock * currentCpu + qty * costPerUnit) / newStock).toFixed(4);
  }
  await db.collection('inventory_items').doc(itemId).update(update);
}

export async function recordItemTransaction(type, itemId, itemName, unit, qty, costPerUnit, reason, batchId, date) {
  if (!itemId || !(qty > 0)) return;
  await addDoc('inventory_transactions', {
    type, item_id: itemId, item_name: itemName,
    quantity:      +qty.toFixed(4),
    unit,
    cost_per_unit: +costPerUnit.toFixed(4),
    total_cost:    +(qty * costPerUnit).toFixed(4),
    reason, batch_id: batchId, date,
  });
  if (type === 'addition') {
    await addStockWeighted(itemId, +qty, costPerUnit);
  } else {
    await adjustStock(itemId, -qty);
  }
}

export async function deductBatchIngredients(ingredients, batchId, date) {
  for (const ing of ingredients.filter(i => i.item_id && (i.quantity || 0) > 0)) {
    const conv        = state.inventory.find(i => i.id === ing.item_id)?.conversion_factor || 1;
    const purchaseQty = ing.quantity / conv;
    await addDoc('inventory_transactions', {
      type: 'deduction', item_id: ing.item_id, item_name: ing.name,
      quantity: ing.quantity, unit: ing.unit,
      cost_per_unit: ing.cost_per_unit || 0, total_cost: ing.line_cost || 0,
      reason: 'production', batch_id: batchId, date,
    });
    await adjustStock(ing.item_id, -purchaseQty);
  }
}

export async function reverseBatchIngredients(ingredients, batchId, date) {
  for (const ing of ingredients.filter(i => i.item_id && (i.quantity || 0) > 0)) {
    const conv        = state.inventory.find(i => i.id === ing.item_id)?.conversion_factor || 1;
    const purchaseQty = ing.quantity / conv;
    await addDoc('inventory_transactions', {
      type: 'addition', item_id: ing.item_id, item_name: ing.name,
      quantity: ing.quantity, unit: ing.unit,
      cost_per_unit: ing.cost_per_unit || 0, total_cost: ing.line_cost || 0,
      reason: 'production reversal', batch_id: batchId, date,
    });
    await addStockWeighted(ing.item_id, purchaseQty, (ing.cost_per_unit || 0) * conv);
  }
}

export function colKey(col) {
  return { inventory_items: 'inventory', recipes: 'recipes', batches: 'batches', inventory_transactions: 'transactions' }[col];
}

export async function loadAll() {
  const [inv, rec, bat, txn] = await Promise.all([
    getCollection('inventory_items'),
    getCollection('recipes'),
    getCollection('batches'),
    getCollection('inventory_transactions'),
  ]);
  state.inventory    = inv;
  state.recipes      = rec;
  state.batches      = bat;
  state.transactions = txn;
}

export async function reload(col) {
  state[colKey(col)] = await getCollection(col);
}
