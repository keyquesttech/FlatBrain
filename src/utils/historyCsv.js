import { toCSV, parseCSV } from './csv.js';
import { LEGACY_KEY_1, LEGACY_KEY_2, migrateInvoiceKeys } from './legacyNames.js';

// History <-> CSV mapping. Scalar fields get their own columns; the nested
// lists (bills, extras) are JSON-encoded into a single cell each, which keeps
// the file both spreadsheet-readable and losslessly re-importable.

const LIST_COLUMNS = [
  'bills',
  'flatmate1Extras',
  'flatmate2Extras',
  'flatmate1FullPriceExtras',
  'flatmate2FullPriceExtras',
  'flatmate1Discounts',
  'flatmate2Discounts'
];

const HEADER = [
  'id', 'period', 'dueDate', 'timestamp', 'paidDate',
  'netTotal', 'eachNetTotal', 'flatmate1TotalDue', 'flatmate2TotalDue', 'splitPercent',
  'flatmate1Name', 'flatmate2Name', 'flatmate1Note', 'flatmate2Note',
  'bankName', 'bankBankName', 'bankSortCode', 'bankAccountNumber',
  ...LIST_COLUMNS
];

export function historyToCSV(invoices) {
  const rows = [HEADER];
  (invoices || []).forEach((inv) => {
    rows.push([
      inv.id ?? '',
      inv.period ?? '',
      inv.dueDate ?? '',
      inv.timestamp ?? '',
      inv.paidDate ?? '',
      inv.netTotal ?? '',
      inv.eachNetTotal ?? '',
      inv.flatmate1TotalDue ?? '',
      inv.flatmate2TotalDue ?? '',
      inv.splitPercent ?? 50,
      inv.names?.flatmate1 ?? '',
      inv.names?.flatmate2 ?? '',
      inv.flatmate1Note ?? '',
      inv.flatmate2Note ?? '',
      inv.bankDetails?.name ?? '',
      inv.bankDetails?.bankName ?? '',
      inv.bankDetails?.sortCode ?? '',
      inv.bankDetails?.accountNumber ?? '',
      ...LIST_COLUMNS.map((key) => JSON.stringify(inv[key] || []))
    ]);
  });
  return toCSV(rows);
}

export function csvToHistory(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file contains no invoices.');

  const header = rows[0].map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  if (!('id' in col) || !('period' in col)) {
    throw new Error('This does not look like a Bill Splitter history CSV (missing id/period columns).');
  }

  const invoices = [];
  for (const row of rows.slice(1)) {
    const get = (key) => (col[key] != null ? (row[col[key]] ?? '') : '');
    const num = (key) => {
      const n = parseFloat(get(key));
      return isNaN(n) ? 0 : n;
    };
    const list = (key) => {
      try {
        const parsed = JSON.parse(get(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    // CSVs exported before the person-key rename used the old person
    // column names — read whichever of the two columns has a value.
    const legacyOf = { flatmate1: LEGACY_KEY_1, flatmate2: LEGACY_KEY_2 };
    const getP = (p, suffix) => {
      const v = get(`${p}${suffix}`);
      return v !== '' ? v : get(`${legacyOf[p]}${suffix}`);
    };
    const numP = (p, suffix) => {
      const n = parseFloat(getP(p, suffix));
      return isNaN(n) ? 0 : n;
    };
    const listP = (p, suffix) => list(get(`${p}${suffix}`) !== '' ? `${p}${suffix}` : `${legacyOf[p]}${suffix}`);

    const id = get('id').trim();
    if (!id) continue; // skip blank/partial rows

    // migrateInvoiceKeys converts old bills[].discountedFrom values too
    invoices.push(migrateInvoiceKeys({
      id,
      period: get('period'),
      dueDate: get('dueDate'),
      timestamp: num('timestamp') || Date.now(),
      paidDate: get('paidDate'),
      netTotal: num('netTotal'),
      eachNetTotal: num('eachNetTotal'),
      flatmate1TotalDue: numP('flatmate1', 'TotalDue'),
      flatmate2TotalDue: numP('flatmate2', 'TotalDue'),
      splitPercent: get('splitPercent') === '' ? 50 : num('splitPercent'),
      names: { flatmate1: getP('flatmate1', 'Name') || 'Flatmate 1', flatmate2: getP('flatmate2', 'Name') || 'Flatmate 2' },
      flatmate1Note: getP('flatmate1', 'Note'),
      flatmate2Note: getP('flatmate2', 'Note'),
      bankDetails: {
        name: get('bankName'),
        bankName: get('bankBankName'),
        sortCode: get('bankSortCode'),
        accountNumber: get('bankAccountNumber')
      },
      bills: list('bills'),
      flatmate1Extras: listP('flatmate1', 'Extras'),
      flatmate2Extras: listP('flatmate2', 'Extras'),
      flatmate1FullPriceExtras: listP('flatmate1', 'FullPriceExtras'),
      flatmate2FullPriceExtras: listP('flatmate2', 'FullPriceExtras'),
      flatmate1Discounts: listP('flatmate1', 'Discounts'),
      flatmate2Discounts: listP('flatmate2', 'Discounts')
    }));
  }

  if (invoices.length === 0) throw new Error('No valid invoices found in the file.');
  return invoices;
}
