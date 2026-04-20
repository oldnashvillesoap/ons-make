/**
 * Authentication UI
 * Handles login, logout, and auth state management
 */

import { auth } from '../config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setVisibility, getInputValue, showAlert } from './common.js';

/**
 * Initialize authentication UI and listeners
 * @param {Function} onLogin - Callback when user logs in
 * @param {Function} onLogout - Callback when user logs out
 */
export function initAuthUI(onLogin, onLogout) {
    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');

    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            setVisibility(authSection, false);
            setVisibility(appSection, true);
            if (onLogin) onLogin(user);
        } else {
            setVisibility(authSection, true);
            setVisibility(appSection, false);
            if (onLogout) onLogout();
        }
    });

    // Setup login button
    document.getElementById('login-btn').addEventListener('click', () => {
        const email = getInputValue('email');
        const password = getInputValue('password');
        
        if (!email || !password) {
            showAlert('Please enter email and password');
            return;
        }

        signInWithEmailAndPassword(auth, email, password)
            .catch(err => {
                console.error(err);
                showAlert(err.message);
            });
    });

    // Setup logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth);
    });
}
