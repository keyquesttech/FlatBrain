import { setCurrencyCode } from './currency.js';

// settings.json, client side: currency plus which apps the password gate
// actually locks. App fetches the doc once at boot and applies it before
// the routes render; the Settings page applies edits live. A missing key
// means locked — new apps default to gated, like everything always was.
const DEFAULT_LOCKS = {
  dashboard: true,
  billsplitter: true,
  rent: true,
  invoices: true,
  settings: true,
  status: true
};

let locks = { ...DEFAULT_LOCKS };

export function normalizePanelSettings(s) {
  return {
    currency: typeof s?.currency === 'string' ? s.currency : 'GBP',
    locks: Object.fromEntries(
      Object.keys(DEFAULT_LOCKS).map((k) => [k, s?.locks?.[k] !== false])
    )
  };
}

export function applyPanelSettings(s) {
  const normalized = normalizePanelSettings(s);
  locks = normalized.locks;
  setCurrencyCode(normalized.currency);
  return normalized;
}

// PasswordGate reads this per render; unknown keys stay locked.
export function isAppLocked(appKey) {
  return locks[appKey] !== false;
}
