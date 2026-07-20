import { parseAmount, round2 } from './calculations.js';

// Shared rent maths + labels, used by both the Rent page and its invoice.

export const monthsOf = (p) => {
  const n = parseInt(p?.months, 10);
  return isNaN(n) || n < 1 ? 1 : n;
};

// Rent rows carry the MONTHLY amount (like the spreadsheet's Amount column);
// what's actually transferred per row is amount × months — the Period total.
export const periodTotal = (p) => round2(parseAmount(p?.amount) * monthsOf(p));

const monthShort = (y, m) =>
  new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

// "Jul – Aug 2026" from a period start (YYYY-MM) and a month count; spells
// both years out when a block crosses New Year.
export function periodLabel(startYm, months) {
  const [y, m] = String(startYm || '').split('-').map(Number);
  if (!y || !m) return '';
  const n = Math.max(1, parseInt(months, 10) || 1);
  const endIndex = m - 1 + n - 1;
  const ey = y + Math.floor(endIndex / 12);
  const em = (endIndex % 12) + 1;
  if (n === 1) return `${monthShort(y, m)} ${y}`;
  return ey === y
    ? `${monthShort(y, m)} – ${monthShort(ey, em)} ${y}`
    : `${monthShort(y, m)} ${y} – ${monthShort(ey, em)} ${ey}`;
}

// The month after a period ends, as YYYY-MM — used to suggest the next row.
export function monthAfterPeriod(startYm, months) {
  const [y, m] = String(startYm || '').split('-').map(Number);
  if (!y || !m) return '';
  const idx = m - 1 + Math.max(1, parseInt(months, 10) || 1);
  return `${y + Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDay(iso) {
  const d = iso ? new Date(iso + 'T00:00:00Z') : null;
  return d && !isNaN(d)
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
}

// Totals for the overview and the invoice: what's been paid and what's
// still owed. The deposit counts as outstanding only while unpaid.
export function rentTotals(rent) {
  const payments = rent?.payments || [];
  const sum = (list) => list.reduce((s, p) => round2(s + periodTotal(p)), 0);
  const scheduleTotal = sum(payments);
  const paidTotal = sum(payments.filter((p) => p.paidDate));
  const rentOutstanding = round2(scheduleTotal - paidTotal);
  const depositAmount = round2(parseAmount(rent?.deposit?.amount));
  const depositOutstanding = depositAmount > 0 && !rent?.deposit?.paidDate ? depositAmount : 0;
  return {
    scheduleTotal,
    paidTotal,
    rentOutstanding,
    depositAmount,
    depositOutstanding,
    totalOutstanding: round2(rentOutstanding + depositOutstanding)
  };
}
