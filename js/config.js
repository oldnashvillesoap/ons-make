/**
 * Firebase Configuration
 * Initialize and export Firebase app, auth, and db instances
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyBH91Vcu_Tyti6f6o3pKkb-M7n4GHHDdHo",
  authDomain: "ons-make.firebaseapp.com",
  projectId: "ons-make",
  storageBucket: "ons-make.firebasestorage.app",
  messagingSenderId: "568456661543",
  appId: "1:568456661543:web:64b56a5aab02c46f469c02",
  measurementId: "G-DMNVE4F7ZC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
