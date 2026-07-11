export const DEFAULT_NAMES = { flatmate1: 'Flatmate1', flatmate2: 'Flatmate2' };

export const DEFAULT_BANK = {
  name: 'Your Name',
  bankName: 'Your Bank',
  sortCode: '00-00-00',
  accountNumber: '00000000'
};

// Ensures a draft coming from the server (which may predate the names/bank
// fields) always has the expected shape, so the UI never crashes on missing
// properties. Existing values are preserved; only absent keys get defaults.
export function normalizeDraft(draft) {
  if (!draft) return draft;
  return {
    period: draft.period || '',
    dueDate: draft.dueDate || '',
    names: { ...DEFAULT_NAMES, ...(draft.names || {}) },
    bills: draft.bills || [],
    flatmate1Extras: draft.flatmate1Extras || [],
    flatmate2Extras: draft.flatmate2Extras || [],
    flatmate1FullPriceExtras: draft.flatmate1FullPriceExtras || [],
    flatmate2FullPriceExtras: draft.flatmate2FullPriceExtras || [],
    flatmate1Note: draft.flatmate1Note || '',
    flatmate2Note: draft.flatmate2Note || '',
    bankDetails: { ...DEFAULT_BANK, ...(draft.bankDetails || {}) }
  };
}
