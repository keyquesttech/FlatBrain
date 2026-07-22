import { setCurrencyCode } from './currency.js';

// settings.json, client side: the currency, per-PAGE password locks and
// which pages get a tile on the dashboard hub. App fetches the doc once at
// boot and applies it before the routes render; the Settings page applies
// edits live. Unknown pages stay locked and off the hub.
//
// Flatmate 2's page defaults open — it has always been the shareable one —
// but it's an ordinary lock now, so it CAN be locked from Settings.
const DEFAULT_LOCKS = {
  dashboard: true,
  billsplitter: true,
  flatmate1: true,
  flatmate2: false,
  rent: true,
  invoices: true,
  settings: true,
  status: true
};

// The apps match the dashboard's original tiles; the flatmate pages are
// new tiles that start hidden until picked in Settings.
const DEFAULT_HUB = {
  billsplitter: true,
  flatmate1: false,
  flatmate2: false,
  rent: true,
  invoices: true,
  settings: true,
  status: true
};

let locks = { ...DEFAULT_LOCKS };
let hub = { ...DEFAULT_HUB };

export function normalizePanelSettings(s) {
  const locksIn = s?.locks || {};
  const hubIn = s?.hub || {};
  return {
    currency: typeof s?.currency === 'string' ? s.currency : 'GBP',
    locks: Object.fromEntries(Object.keys(DEFAULT_LOCKS).map((k) => {
      // Flatmate 1 was covered by the app-wide billsplitter lock before
      // pages had their own; a doc saved back then hands that value down.
      const v = locksIn[k] ?? (k === 'flatmate1' ? locksIn.billsplitter : undefined);
      return [k, typeof v === 'boolean' ? v : DEFAULT_LOCKS[k]];
    })),
    hub: Object.fromEntries(Object.keys(DEFAULT_HUB).map((k) => {
      const v = hubIn[k];
      return [k, typeof v === 'boolean' ? v : DEFAULT_HUB[k]];
    }))
  };
}

export function applyPanelSettings(s) {
  const normalized = normalizePanelSettings(s);
  locks = normalized.locks;
  hub = normalized.hub;
  setCurrencyCode(normalized.currency);
  return normalized;
}

// PasswordGate reads this per render; unknown keys stay locked.
export function isPageLocked(pageKey) {
  return locks[pageKey] !== false;
}

// The dashboard reads this per render to decide which tiles to show.
export function isOnHub(pageKey) {
  return hub[pageKey] === true;
}
