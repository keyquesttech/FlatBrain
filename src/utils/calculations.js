export function parseAmount(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// All computed amounts round to whole pence (2 decimals), and anything
// beyond the second decimal always rounds UP: 2.333 → 2.34. Sums of clean
// 2dp values carry float noise (0.1 + 0.2 = 0.30000000000000004), so values
// within a whisker of an exact penny count as exact instead of being bumped
// up a penny.
export function round2(n) {
  const cents = n * 100;
  const nearest = Math.round(cents);
  if (Math.abs(cents - nearest) < 1e-7) return nearest / 100;
  return Math.ceil(cents) / 100;
}

// Trims typed input to two decimal places, so a third decimal can never be
// entered (computed amounts round up instead — see round2).
export function limitDecimals(value) {
  const s = String(value ?? '');
  const i = s.indexOf('.');
  return i === -1 ? s : s.slice(0, i + 3);
}

export function packsOf(extra) {
  const n = parseInt(extra?.packs, 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

// An extra's price field is the price per pack; the charged amount is packs × price.
export function extraTotal(extra) {
  return packsOf(extra) * parseAmount(extra?.price);
}

// An extra's percent is the share of it charged to the OTHER flatmate
// (the one who didn't add it). Defaults to 50; 100 = fully charged over.
export function extraPercent(extra) {
  const n = parseFloat(extra?.percent);
  if (isNaN(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

// An extra splits into the part charged to the other flatmate and the
// remainder kept by whoever added it. The charged part is rounded to pence
// and the remainder derived by subtraction, so the parts always sum to the
// item's total exactly and displayed lines reconcile with card totals.
export function extraShares(extra) {
  const total = round2(extraTotal(extra));
  const charged = round2((total * extraPercent(extra)) / 100);
  return { total, charged, remainder: round2(total - charged) };
}

// A person's extras as one list with a normalized percent on every item.
// Merges the legacy full-price list (pre-per-item-percent drafts/invoices)
// in as 100% items, so old data keeps computing identically.
export function mergedExtras(data, personKey) {
  const own = (data[`${personKey}Extras`] || []).map((e) => ({ ...e, percent: extraPercent(e) }));
  const legacyFull = (data[`${personKey}FullPriceExtras`] || []).map((e) => ({ ...e, percent: 100 }));
  return [...own, ...legacyFull];
}

// A bill's discount percent: how much of it is discounted (0–100). Bills
// predating the percent box carry discounted: true, which meant 100%.
export function billDiscountPercent(bill) {
  if (bill?.discountPercent != null && bill.discountPercent !== '') {
    const n = parseFloat(bill.discountPercent);
    if (isNaN(n)) return 0;
    return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
  }
  return bill?.discounted ? 100 : 0;
}

// Who the discounted portion is discounted for: 'na' (everyone — nobody pays
// it), a flatmate key (the other flatmate covers it), or null when the bill
// isn't discounted at all.
export function billDiscountFrom(bill) {
  return billDiscountPercent(bill) > 0 ? (bill?.discountedFrom || 'na') : null;
}

// The slice of a bill somebody actually pays (drives the history charts):
// an 'All' discount waives its percent of the bill; a bill discounted for
// one flatmate is still charged in full, just entirely to the other person.
export function chargedBillAmount(bill) {
  const amount = round2(parseAmount(bill?.amount));
  if (billDiscountFrom(bill) !== 'na') return amount;
  return round2(amount - round2((amount * billDiscountPercent(bill)) / 100));
}

// The split percent is flatmate 1 (matias)'s share of all shared costs;
// flatmate 2 (reka) pays the remainder. Invalid input falls back to 50/50.
export function clampSplitPercent(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

// A discount is { thing, type: 'amount'|'percent', value }. Percent discounts
// apply to that person's pre-discount total (bills share + extras share).
// Rounded per discount so displayed lines sum to the deducted total exactly.
export function discountAmount(discount, base) {
  const v = parseAmount(discount?.value);
  return round2(discount?.type === 'percent' ? (base * v) / 100 : v);
}

export function sumDiscounts(discounts, base) {
  return (discounts || []).reduce((sum, d) => sum + discountAmount(d, base), 0);
}

export function calculateInvoice(data) {
  const splitPercent = clampSplitPercent(data.splitPercent ?? 50);
  const p = splitPercent / 100;

  // Each bill's discount percent carves off a "discounted portion"; the rest
  // is split between the flatmates at the split percent. Portion discounted
  // for 'na'/All: waived, nobody pays it. Portion discounted for a flatmate:
  // the OTHER flatmate covers it (itemized on their card). The portion is
  // rounded to pence and the shared remainder derived by subtraction, then
  // one split part is rounded and the other derived the same way — so every
  // charged penny lands on exactly one flatmate and all totals reconcile.
  let matiasSharedShare = 0;
  let rekaSharedShare = 0;
  let matiasDiscountedBills = 0; // portions discounted for Réka — Matias covers them
  let rekaDiscountedBills = 0; // portions discounted for Matias — Réka covers them
  let billsRawTotal = 0;
  const billDiscountLines = [];
  (data.bills || []).forEach((b) => {
    const amount = round2(parseAmount(b.amount));
    const percent = billDiscountPercent(b);
    const from = billDiscountFrom(b);
    billsRawTotal = round2(billsRawTotal + amount);

    const portion = round2((amount * percent) / 100);
    const shared = round2(amount - portion);
    const mPart = round2(shared * p);
    matiasSharedShare = round2(matiasSharedShare + mPart);
    rekaSharedShare = round2(rekaSharedShare + round2(shared - mPart));

    if (from === null) return;
    if (from === 'reka') matiasDiscountedBills = round2(matiasDiscountedBills + portion);
    if (from === 'matias') rekaDiscountedBills = round2(rekaDiscountedBills + portion);
    billDiscountLines.push({
      id: b.id,
      thing: b.thing,
      from,
      percent,
      amount,
      portion,
      waived: from === 'na' ? portion : 0
    });
  });
  const matiasBillsShare = round2(matiasSharedShare + matiasDiscountedBills);
  const rekaBillsShare = round2(rekaSharedShare + rekaDiscountedBills);
  const billsTotal = round2(matiasBillsShare + rekaBillsShare);

  // Each extra charges its percent to the other flatmate; the person who
  // added it pays the remainder. Per-item rounded parts are summed so the
  // itemized lines always add up to the share exactly.
  const matiasItems = mergedExtras(data, 'matias');
  const rekaItems = mergedExtras(data, 'reka');
  const shareOf = (items, isOwn) => items.reduce(
    (sum, e) => round2(sum + extraShares(e)[isOwn ? 'remainder' : 'charged']),
    0
  );

  const matiasShareExtras = round2(shareOf(matiasItems, true) + shareOf(rekaItems, false));
  const rekaShareExtras = round2(shareOf(rekaItems, true) + shareOf(matiasItems, false));
  // Every item's charged part + remainder equals its total, so this is the
  // exact sum of all item totals.
  const extrasTotal = round2(matiasShareExtras + rekaShareExtras);

  const matiasBeforeDiscounts = round2(matiasBillsShare + matiasShareExtras);
  const rekaBeforeDiscounts = round2(rekaBillsShare + rekaShareExtras);

  const matiasDiscountTotal = round2(sumDiscounts(data.matiasDiscounts, matiasBeforeDiscounts));
  const rekaDiscountTotal = round2(sumDiscounts(data.rekaDiscounts, rekaBeforeDiscounts));

  const matiasTotalDue = round2(matiasBeforeDiscounts - matiasDiscountTotal);
  const rekaTotalDue = round2(rekaBeforeDiscounts - rekaDiscountTotal);

  return {
    splitPercent,
    billsTotal,
    billsRawTotal,
    billDiscountLines,
    matiasSharedShare,
    rekaSharedShare,
    matiasBillsShare,
    rekaBillsShare,
    matiasShareExtras,
    rekaShareExtras,
    matiasBeforeDiscounts,
    rekaBeforeDiscounts,
    matiasDiscountTotal,
    rekaDiscountTotal,
    matiasTotalDue,
    rekaTotalDue,
    extrasTotal,
    // Grand total = charged bills + all extras, so it always equals the
    // Bills card total plus the Total extras line (and the flatmates' dues
    // before their personal discounts).
    grandTotal: round2(billsTotal + extrasTotal),
    netTotal: round2(matiasTotalDue + rekaTotalDue)
  };
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP'
});

export function formatCurrency(amount) {
  return GBP.format(parseAmount(amount));
}

// Always shows the pack count and per-pack price, e.g. "Bulbs (2 × £7.50)".
export function formatExtraLabel(extra) {
  return `${extra.thing || 'Unnamed item'} (${packsOf(extra)} × ${formatCurrency(extra.price)})`;
}
