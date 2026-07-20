import { newId } from './id.js';
import { parseAmount, round2 } from './calculations.js';

// Standing charges memory: the next month's bills, pre-filled from history.
// The newest invoice decides WHICH bills exist (and their order); each
// amount is the rolling average of that bill's last few non-zero
// appearances (matched by name, case-insensitively), so a fresh invoice
// starts as a best guess of a typical month. Discounts are month-specific
// and never carried over.
const ROLLING_MONTHS = 3;

export function prefillBillsFromHistory(history) {
  const sorted = [...(history || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const latest = sorted[0];
  if (!latest?.bills?.length) return null;

  const keyOf = (thing) => (thing || '').trim().toLowerCase();
  const bills = latest.bills
    .filter((b) => keyOf(b.thing))
    .map((b) => {
      const amounts = [];
      for (const inv of sorted) {
        const match = (inv.bills || []).find(
          (x) => keyOf(x.thing) === keyOf(b.thing) && parseAmount(x.amount) > 0
        );
        if (match) amounts.push(parseAmount(match.amount));
        if (amounts.length === ROLLING_MONTHS) break;
      }
      const avg = amounts.length
        ? round2(amounts.reduce((sum, v) => sum + v, 0) / amounts.length)
        : 0;
      return {
        id: newId(),
        thing: b.thing.trim(),
        amount: avg > 0 ? String(avg) : '',
        discountPercent: '',
        discountedFrom: 'na'
      };
    });
  return bills.length > 0 ? bills : null;
}
