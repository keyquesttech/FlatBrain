// Bill Splitter's API namespace under the FlatBrain server; each app gets
// its own /api/<app> prefix (the server also keeps bare /api/* for
// back-compat with pre-FlatBrain clients).
const API_URL = '/api/billsplitter';

// Throws on HTTP errors so callers can catch and react, instead of silently
// receiving an error payload where data was expected.
async function request(path, options) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) throw new Error(`API ${path} failed with status ${res.status}`);
  return res.json();
}

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

export const getBackupStatus = () => request('/backup/status');
export const getBackupDevices = () => request('/backup/devices');
export const mountBackupDevice = (path) => request('/backup/mount', jsonBody('POST', { path }));
export const updateBackupConfig = (config) => request('/backup/config', jsonBody('PUT', config));
export const runBackupNow = () => request('/backup/run', { method: 'POST' });
export const ejectBackupDevice = () => request('/backup/eject', { method: 'POST' });
export const restoreBackup = (name) => request('/backup/restore', jsonBody('POST', { name }));
export const deleteBackup = (name) => request(`/backup/${encodeURIComponent(name)}`, { method: 'DELETE' });
