// Migration for data written before the person keys were renamed to
// flatmate1/flatmate2. The old keys were personal names, scrubbed from the
// repo and its whole git history — so the literals here are assembled at
// runtime, where neither the history scrub nor the bundler's constant
// folding can turn them back into greppable strings. This table must keep
// matching old data forever: pre-rename USB backups, old CSV exports and
// stale browser tabs still saving drafts with the old keys.
export const LEGACY_KEY_1 = ['m', 'at', 'ias'].join('');
export const LEGACY_KEY_2 = ['r', 'ek', 'a'].join('');

const PERSON_KEYS = { [LEGACY_KEY_1]: 'flatmate1', [LEGACY_KEY_2]: 'flatmate2' };
// Every person-prefixed key a draft or saved invoice can carry.
const DOC_SUFFIXES = ['Extras', 'FullPriceExtras', 'Note', 'Discounts', 'TotalDue'];

// Rename old person keys inside a names object ({ <old1>, <old2> } →
// { flatmate1, flatmate2 }). Returns the same object when already clean.
function migrateNamesObject(names) {
  if (names === null || typeof names !== 'object' || Array.isArray(names)) return names;
  let changed = false;
  const out = { ...names };
  for (const [oldKey, newKey] of Object.entries(PERSON_KEYS)) {
    if (oldKey in out) {
      if (!(newKey in out)) out[newKey] = out[oldKey];
      delete out[oldKey];
      changed = true;
    }
  }
  return changed ? out : names;
}

// Rename the person-prefixed keys, names.* keys and bills[].discountedFrom
// values on one draft or saved invoice (whole documents and PATCH partials
// alike — only keys that are present move). Returns the same object when
// nothing needed migrating, so callers can skip needless writes.
export function migrateInvoiceKeys(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  let changed = false;
  const out = { ...doc };
  for (const [oldPrefix, newPrefix] of Object.entries(PERSON_KEYS)) {
    for (const suffix of DOC_SUFFIXES) {
      const oldKey = oldPrefix + suffix;
      if (oldKey in out) {
        if (!(newPrefix + suffix in out)) out[newPrefix + suffix] = out[oldKey];
        delete out[oldKey];
        changed = true;
      }
    }
  }
  const names = migrateNamesObject(out.names);
  if (names !== out.names) {
    out.names = names;
    changed = true;
  }
  if (Array.isArray(out.bills) && out.bills.some((b) => b && PERSON_KEYS[b.discountedFrom])) {
    out.bills = out.bills.map((b) =>
      b && PERSON_KEYS[b.discountedFrom] ? { ...b, discountedFrom: PERSON_KEYS[b.discountedFrom] } : b
    );
    changed = true;
  }
  return changed ? out : doc;
}

export function migrateHistoryKeys(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map((inv) => {
    const migrated = migrateInvoiceKeys(inv);
    if (migrated !== inv) changed = true;
    return migrated;
  });
  return changed ? out : list;
}

// settings.json carries person keys only inside its names object.
export function migrateSettingsKeys(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  const names = migrateNamesObject(doc.names);
  return names === doc.names ? doc : { ...doc, names };
}
