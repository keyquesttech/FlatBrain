import { toCSV, parseCSV } from './csv.js';

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
  'id', 'period', 'dueDate', 'timestamp',
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

    const id = get('id').trim();
    if (!id) continue; // skip blank/partial rows

    invoices.push({
      id,
      period: get('period'),
      dueDate: get('dueDate'),
      timestamp: num('timestamp') || Date.now(),
      netTotal: num('netTotal'),
      eachNetTotal: num('eachNetTotal'),
      flatmate1TotalDue: num('flatmate1TotalDue'),
      flatmate2TotalDue: num('flatmate2TotalDue'),
      splitPercent: get('splitPercent') === '' ? 50 : num('splitPercent'),
      names: { flatmate1: get('flatmate1Name') || 'Flatmate1', flatmate2: get('flatmate2Name') || 'Flatmate2' },
      flatmate1Note: get('flatmate1Note'),
      flatmate2Note: get('flatmate2Note'),
      bankDetails: {
        name: get('bankName'),
        bankName: get('bankBankName'),
        sortCode: get('bankSortCode'),
        accountNumber: get('bankAccountNumber')
      },
      bills: list('bills'),
      flatmate1Extras: list('flatmate1Extras'),
      flatmate2Extras: list('flatmate2Extras'),
      flatmate1FullPriceExtras: list('flatmate1FullPriceExtras'),
      flatmate2FullPriceExtras: list('flatmate2FullPriceExtras'),
      flatmate1Discounts: list('flatmate1Discounts'),
      flatmate2Discounts: list('flatmate2Discounts')
    });
  }

  if (invoices.length === 0) throw new Error('No valid invoices found in the file.');
  return invoices;
}
