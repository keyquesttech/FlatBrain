import { parseAmount, round2 } from './calculations.js';

// Shared rent helpers. The block-based fields (periodStart + months ×
// monthly amount) only survive here to migrate pre-redesign rent data
// into free-form payment items.

export const monthsOf = (p) => {
  const n = parseInt(p?.months, 10);
  return isNaN(n) || n < 1 ? 1 : n;
};

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
