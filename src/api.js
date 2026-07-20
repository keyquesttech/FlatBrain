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

export const login = (password) => request('/login', jsonBody('POST', { password }));

export const getDraft = () => request('/draft');
export const updateDraft = (draft) => request('/draft', jsonBody('PUT', draft));
// Partial update: only the keys sent are replaced; the server merges them
// into the current draft atomically.
export const patchDraft = (changes) => request('/draft', jsonBody('PATCH', changes));
export const resetDraft = () => request('/draft/reset', { method: 'POST' });

export const getHistory = () => request('/history');
export const saveInvoice = (invoice) => request('/history', jsonBody('POST', invoice));
export const importHistory = (invoices) => request('/history/import', jsonBody('POST', { invoices }));
export const deleteInvoice = (id) => request(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' });

// USB backup is panel-level: one backup covers every app's data.
export const getBackupStatus = () => panelRequest('/backup/status');
export const getBackupDevices = () => panelRequest('/backup/devices');
export const mountBackupDevice = (path) => panelRequest('/backup/mount', jsonBody('POST', { path }));
export const updateBackupConfig = (config) => panelRequest('/backup/config', jsonBody('PUT', config));
export const runBackupNow = () => panelRequest('/backup/run', { method: 'POST' });
export const ejectBackupDevice = () => panelRequest('/backup/eject', { method: 'POST' });
export const restoreBackup = (name) => panelRequest('/backup/restore', jsonBody('POST', { name }));
export const deleteBackup = (name) => panelRequest(`/backup/${encodeURIComponent(name)}`, { method: 'DELETE' });
