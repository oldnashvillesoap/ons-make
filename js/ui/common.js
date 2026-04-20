/**
 * Common UI Utilities
 * Shared UI functions and helpers
 */

/**
 * Show/hide an element
 * @param {string|HTMLElement} target - Element ID or element
 * @param {boolean} show - True to show, false to hide
 */
export function setVisibility(target, show) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (element) {
        if (show) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    }
}

/**
 * Get form input value
 * @param {string} id - Element ID
 * @returns {string|null}
 */
export function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : null;
}

/**
 * Set form input value
 * @param {string} id - Element ID
 * @param {string} value - Value to set
 */
export function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

/**
 * Clear form inputs
 * @param {array<string>} ids - Array of element IDs to clear
 */
export function clearInputs(...ids) {
    ids.forEach(id => setInputValue(id, ''));
}

/**
 * Show alert modal
 * @param {string} message - Message to display
 */
export function showAlert(message) {
    alert(message);
}

/**
 * Show confirmation modal
 * @param {string} message - Message to display
 * @returns {boolean}
 */
export function showConfirm(message) {
    return confirm(message);
}

/**
 * Attach click handler to an element
 * @param {string} id - Element ID
 * @param {Function} handler - Click handler function
 */
export function onClick(id, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('click', handler);
    }
}

/**
 * Attach change handler to an element
 * @param {string} id - Element ID
 * @param {Function} handler - Change handler function
 */
export function onChange(id, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('change', handler);
    }
}

/**
 * Set HTML content
 * @param {string} id - Element ID
 * @param {string} html - HTML content
 */
export function setHTML(id, html) {
    const element = document.getElementById(id);
    if (element) {
        element.innerHTML = html;
    }
}

/**
 * Get HTML element
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export function getElement(id) {
    return document.getElementById(id);
}

/**
 * Add class to element
 * @param {string} id - Element ID
 * @param {string} className - Class name
 */
export function addClass(id, className) {
    const element = getElement(id);
    if (element) {
        element.classList.add(className);
    }
}

/**
 * Remove class from element
 * @param {string} id - Element ID
 * @param {string} className - Class name
 */
export function removeClass(id, className) {
    const element = getElement(id);
    if (element) {
        element.classList.remove(className);
    }
}
