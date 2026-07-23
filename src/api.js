// FlatBrain's API client. App endpoints live under their own /api/<app>
// prefix (Bill Splitter's is /api/billsplitter); panel-level endpoints —
// backup, system stats — live directly under /api.
const API_URL = '/api/billsplitter';

// Throws on HTTP errors so callers can catch and react, instead of silently
// receiving an error payload where data was expected.
async function http(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`API ${url} failed with status ${res.status}`);
  return res.json();
}

const request = (path, options) => http(`${API_URL}${path}`, options);
// Panel-level endpoints (whole-FlatBrain concerns, not one app's)
const panelRequest = (path, options) => http(`/api${path}`, options);

const jsonBody = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

// page is the gate's pageKey, so the log can say where the log-in happened
export const login = (password, page) => request('/login', jsonBody('POST', { password, page }));
// Guest log-in beacon: the lock screen's Guest login button (viaGate) and
// password-free pages opening in a browser that isn't logged in. Fire-and-
// forget — a lost beacon must never get in the way of browsing.
export const guestLogin = (page, viaGate = false) =>
  request('/login/guest', jsonBody('POST', { page, viaGate })).catch(() => {});
// Log-out stays client-side (clearing the gate's storage) — this beacon
// just puts it on the record; keepalive lets it outlive the navigation.
export const logLogout = () => {
  try {
    fetch('/api/logout', { method: 'POST', keepalive: true }).catch(() => {});
  } catch { /* never block logging out */ }
};
// Panel-level: the one shared password gates the locked apps; Settings
// changes it (no old password needed — it's a LAN-only panel).
export const changePassword = (newPassword) =>
  panelRequest('/password', jsonBody('POST', { newPassword }));

// Panel settings (settings.json, managed in Settings): display currency +
// which apps the password gate locks. Whole-document GET/PUT.
export const getPanelSettings = () => panelRequest('/settings');
export const updatePanelSettings = (settings) => panelRequest('/settings', jsonBody('PUT', settings));

// from names the page doing the save (billsplitter / flatmate1 /
// flatmate2) so the activity log can say where the edit came from.
const fromQuery = (from) => (from ? `?from=${encodeURIComponent(from)}` : '');
export const getDraft = () => request('/draft');
export const updateDraft = (draft, from) => request(`/draft${fromQuery(from)}`, jsonBody('PUT', draft));
// Partial update: only the keys sent are replaced; the server merges them
// into the current draft atomically.
export const patchDraft = (changes, from) => request(`/draft${fromQuery(from)}`, jsonBody('PATCH', changes));
export const resetDraft = () => request('/draft/reset', { method: 'POST' });

export const getHistory = () => request('/history');
export const saveInvoice = (invoice) => request('/history', jsonBody('POST', invoice));
export const importHistory = (invoices) => request('/history/import', jsonBody('POST', { invoices }));
export const deleteInvoice = (id) => request(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Shared bank accounts (payments.json, managed in Settings): one document,
// whole-object reads and writes, feeding every bank-details picker.
export const getPayments = () => http('/api/payments');
export const updatePayments = (payments) => http('/api/payments', jsonBody('PUT', payments));

// Rent: one document, whole-object reads and writes.
export const getRent = () => http('/api/rent');
export const updateRent = (rent) => http('/api/rent', jsonBody('PUT', rent));

// Custom invoice generator: one document, whole-object reads and writes.
export const getInvoicesDoc = () => http('/api/invoices');
export const updateInvoicesDoc = (docBody) => http('/api/invoices', jsonBody('PUT', docBody));

// USB backup is panel-level: one backup covers every app's data.
export const getBackupStatus = () => panelRequest('/backup/status');
export const getBackupDevices = () => panelRequest('/backup/devices');
export const mountBackupDevice = (path) => panelRequest('/backup/mount', jsonBody('POST', { path }));
export const updateBackupConfig = (config) => panelRequest('/backup/config', jsonBody('PUT', config));
export const runBackupNow = () => panelRequest('/backup/run', { method: 'POST' });
export const ejectBackupDevice = () => panelRequest('/backup/eject', { method: 'POST' });
export const restoreBackup = (name) => panelRequest('/backup/restore', jsonBody('POST', { name }));
export const deleteBackup = (name) => panelRequest(`/backup/${encodeURIComponent(name)}`, { method: 'DELETE' });

// Activity log (panel-level)
export const getLogs = () => panelRequest('/logs');
export const updateLogsConfig = (config) => panelRequest('/logs/config', jsonBody('PUT', config));
export const clearLogs = () => panelRequest('/logs', { method: 'DELETE' });

// Scheduled reboots (panel-level, like backups)
export const getRebootStatus = () => panelRequest('/reboot/status');
export const updateRebootConfig = (config) => panelRequest('/reboot/config', jsonBody('PUT', config));
export const rebootNow = () => panelRequest('/reboot/now', { method: 'POST' });
