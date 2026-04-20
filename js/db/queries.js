/**
 * Firebase Firestore Queries & Listeners
 * All database operations and real-time listeners
 */

import { db, auth } from '../config.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    where, 
    updateDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Get next batch number by finding the highest existing batch number
 * @returns {Promise<number>} - Next batch number
 */
export async function getNextBatchNumber() {
    const batchesQuery = query(
        collection(db, "batches"), 
        where("userId", "==", auth.currentUser.uid), 
        orderBy("batchNumber", "desc")
    );
    let lastBatchNum = 1000; // Start at 1001
    
    try {
        const snapshot = await new Promise((resolve, reject) => {
            const unsubscribe = onSnapshot(batchesQuery, (snap) => {
                unsubscribe();
                resolve(snap);
            }, reject);
        });
        
        if (!snapshot.empty) {
            lastBatchNum = snapshot.docs[0].data().batchNumber;
        }
    } catch (err) {
        console.log("First batch number assignment");
    }
    return lastBatchNum + 1;
}

/**
 * Listen to recipes collection and call callback on updates
 * @param {Function} callback - Called with array of recipes
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToRecipes(callback) {
    const q = query(
        collection(db, "recipes"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
    );
    
    return onSnapshot(q, (snapshot) => {
        const recipes = [];
        snapshot.forEach((doc) => {
            recipes.push({ ...doc.data(), id: doc.id });
        });
        callback(recipes);
    });
}

/**
 * Add a new recipe
 * @param {object} recipeData - Recipe details
 * @returns {Promise}
 */
export async function addRecipe(recipeData) {
    return addDoc(collection(db, "recipes"), {
        ...recipeData,
        userId: auth.currentUser.uid,
        createdAt: new Date()
    });
}

/**
 * Listen to inventory collection and call callback on updates
 * @param {Function} callback - Called with array of inventory entries
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToInventory(callback) {
    const q = query(
        collection(db, "inventory"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("dateReceived", "asc")
    );

    return onSnapshot(q, (snapshot) => {
        const inventory = [];
        snapshot.forEach((doc) => {
            inventory.push({ ...doc.data(), docId: doc.id });
        });
        callback(inventory);
    });
}

/**
 * Add a new inventory receipt
 * @param {object} inventoryData - Inventory details
 * @returns {Promise}
 */
export async function addInventory(inventoryData) {
    return addDoc(collection(db, "inventory"), {
        ...inventoryData,
        userId: auth.currentUser.uid,
        dateReceived: new Date()
    });
}

/**
 * Listen to batches collection and call callback on updates
 * @param {Function} callback - Called with array of batches
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToBatches(callback) {
    const q = query(
        collection(db, "batches"),
        where("userId", "==", auth.currentUser.uid),
        orderBy("date", "desc")
    );

    return onSnapshot(q, (snapshot) => {
        const batches = [];
        snapshot.forEach((doc) => {
            batches.push({ ...doc.data(), docId: doc.id });
        });
        callback(batches);
    });
}

/**
 * Add a new batch
 * @param {object} batchData - Batch details
 * @returns {Promise}
 */
export async function addBatch(batchData) {
    return addDoc(collection(db, "batches"), {
        ...batchData,
        userId: auth.currentUser.uid,
        createdAt: new Date()
    });
}

/**
 * Update a batch
 * @param {string} batchId - Batch document ID
 * @param {object} updates - Fields to update
 * @returns {Promise}
 */
export async function updateBatch(batchId, updates) {
    return updateDoc(doc(db, "batches", batchId), updates);
}
