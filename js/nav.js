let _navigate = null;
export function setNavigate(fn) { _navigate = fn; }
export function navigate(view) { if (_navigate) _navigate(view); }
