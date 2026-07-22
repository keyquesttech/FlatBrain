import { setCurrencyCode } from './currency.js';
import { DEFAULT_NAMES } from './defaults.js';

// settings.json, client side: the currency and the custom hub — a named,
// password-free landing page at /hub. The hub's ticked pages are the whole
// access model: on the hub = open without the password, off the hub =
// PasswordGate asks. App fetches the doc once at boot and applies it
// before the routes render; the Settings page applies edits live.
//
// Flatmate 2's page starts on the hub — it has always been the shareable
// one — so the old open link keeps working out of the box.
const DEFAULT_TILES = {
  billsplitter: false,
  flatmate1: false,
  flatmate2: true,
  rent: false,
  invoices: false,
  settings: false,
  status: false
};

let hubTiles = { ...DEFAULT_TILES };
let hubTitle = '';
let names = { matias: '', reka: '' };

export function normalizePanelSettings(s) {
  const tilesIn = s?.hub?.tiles;
  const legacyLocks = s?.locks || {};
  return {
    currency: typeof s?.currency === 'string' ? s.currency : 'GBP',
    names: {
      matias: typeof s?.names?.matias === 'string' ? s.names.matias : '',
      reka: typeof s?.names?.reka === 'string' ? s.names.reka : ''
    },
    hub: {
      name: typeof s?.hub?.name === 'string' ? s.hub.name : '',
      tiles: Object.fromEntries(Object.keys(DEFAULT_TILES).map((k) => {
        const v = tilesIn?.[k];
        if (typeof v === 'boolean') return [k, v];
        // Docs from the per-page-locks era have no hub.tiles; a page that
        // was unlocked there was the guest-accessible one, so it lands on
        // the hub (flatmate1 falls back to the older app-wide lock).
        const lock = legacyLocks[k] ?? (k === 'flatmate1' ? legacyLocks.billsplitter : undefined);
        if (typeof lock === 'boolean') return [k, lock === false];
        return [k, DEFAULT_TILES[k]];
      }))
    }
  };
}

export function applyPanelSettings(s) {
  const normalized = normalizePanelSettings(s);
  hubTiles = normalized.hub.tiles;
  hubTitle = normalized.hub.name;
  names = normalized.names;
  setCurrencyCode(normalized.currency);
  return normalized;
}

// The flatmates' display names, panel-wide (Settings' Flatmates card):
// Navigation tabs, Bill Splitter labels, invoices and hub tiles all read
// these. Empty falls back to the code defaults.
export function flatmateNames() {
  return {
    matias: names.matias.trim() || DEFAULT_NAMES.matias,
    reka: names.reka.trim() || DEFAULT_NAMES.reka
  };
}

// PasswordGate reads this per render: hub pages are open, everything else
// (unknown keys included) wants the password.
export function isPageLocked(pageKey) {
  return hubTiles[pageKey] !== true;
}

// The hub page reads this per render to decide which tiles to show.
export function isOnHub(pageKey) {
  return hubTiles[pageKey] === true;
}

export function hubName() {
  return hubTitle.trim() || 'FlatBrain';
}
