import { toCSV, parseCSV } from './csv.js';

// History <-> CSV mapping. Scalar fields get their own columns; the nested
// lists (bills, extras) are JSON-encoded into a single cell each, which keeps
// the file both spreadsheet-readable and losslessly re-importable.

const LIST_COLUMNS = [
  'bills',
  'matiasExtras',
  'rekaExtras',
  'matiasFullPriceExtras',
  'rekaFullPriceExtras',
  'matiasDiscounts',
  'rekaDiscounts'
];

const HEADER = [
  'id', 'period', 'dueDate', 'timestamp', 'paidDate',
  'netTotal', 'eachNetTotal', 'matiasTotalDue', 'rekaTotalDue', 'splitPercent',
  'matiasName', 'rekaName', 'matiasNote', 'rekaNote',
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
      inv.matiasTotalDue ?? '',
      inv.rekaTotalDue ?? '',
      inv.splitPercent ?? 50,
      inv.names?.matias ?? '',
      inv.names?.reka ?? '',
      inv.matiasNote ?? '',
      inv.rekaNote ?? '',
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
      paidDate: get('paidDate'),
      netTotal: num('netTotal'),
      eachNetTotal: num('eachNetTotal'),
      matiasTotalDue: num('matiasTotalDue'),
      rekaTotalDue: num('rekaTotalDue'),
      splitPercent: get('splitPercent') === '' ? 50 : num('splitPercent'),
      names: { matias: get('matiasName') || 'Matias', reka: get('rekaName') || 'Réka' },
      matiasNote: get('matiasNote'),
      rekaNote: get('rekaNote'),
      bankDetails: {
        name: get('bankName'),
        bankName: get('bankBankName'),
        sortCode: get('bankSortCode'),
        accountNumber: get('bankAccountNumber')
      },
      bills: list('bills'),
      matiasExtras: list('matiasExtras'),
      rekaExtras: list('rekaExtras'),
      matiasFullPriceExtras: list('matiasFullPriceExtras'),
      rekaFullPriceExtras: list('rekaFullPriceExtras'),
      matiasDiscounts: list('matiasDiscounts'),
      rekaDiscounts: list('rekaDiscounts')
    });
  }

  if (invoices.length === 0) throw new Error('No valid invoices found in the file.');
  return invoices;
}
