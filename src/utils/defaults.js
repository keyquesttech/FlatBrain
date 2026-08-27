import { mergedExtras } from './calculations.js';

// Placeholder display names — the real ones are set in Settings and live
// in git-ignored settings.json. The flatmate1/flatmate2 keys are the data schema
// (draft/history JSON, CSV columns), not anyone's name.
export const DEFAULT_NAMES = { flatmate1: 'Flatmate 1', flatmate2: 'Flatmate 2' };

export const DEFAULT_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

// Bills predating the per-bill discount percent used a checkbox
// (discounted: true meant a 100% discount); fold that into discountPercent
// and drop the flag so the form always edits one representation.
function normalizeBill(bill) {
  const { discounted, ...rest } = bill;
  return {
    ...rest,
    discountPercent: bill.discountPercent ?? (discounted ? '100' : ''),
    discountedFrom: bill.discountedFrom || 'na'
  };
}

// Ensures a draft coming from the server (which may predate the names/bank
// fields) always has the expected shape, so the UI never crashes on missing
// properties. Existing values are preserved; only absent keys get defaults.
export function normalizeDraft(draft) {
  if (!draft) return draft;
  return {
    period: draft.period || '',
    dueDate: draft.dueDate || '',
    // A filled payment date is what marks the invoice paid (PAID stamp)
    paidDate: draft.paidDate || '',
    names: { ...DEFAULT_NAMES, ...(draft.names || {}) },
    bills: (draft.bills || []).map(normalizeBill),
    // Extras are one list per person with a per-item percent; legacy
    // full-price lists are folded in as 100% items (see mergedExtras).
    flatmate1Extras: mergedExtras(draft, 'flatmate1'),
    flatmate2Extras: mergedExtras(draft, 'flatmate2'),
    flatmate1FullPriceExtras: [],
    flatmate2FullPriceExtras: [],
    flatmate1Note: draft.flatmate1Note || '',
    flatmate2Note: draft.flatmate2Note || '',
    flatmate1Discounts: draft.flatmate1Discounts || [],
    flatmate2Discounts: draft.flatmate2Discounts || [],
    splitPercent: draft.splitPercent ?? 50,
    bankDetails: { ...DEFAULT_BANK, ...(draft.bankDetails || {}) }
  };
}
