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

// Trims typed input to `places` decimals (default two, so a third decimal
// can't be entered; computed amounts round up instead — see round2). The
// extras price field passes a higher limit for prices like 14/6 = 2.3333….
export function limitDecimals(value, places = 2) {
  const s = String(value ?? '');
  const i = s.indexOf('.');
  return i === -1 ? s : s.slice(0, i + 1 + places);
}

export function packsOf(extra) {
  const n = parseInt(extra?.packs, 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

// An extra's price field is the price per pack; the charged amount is packs × price.
export function extraTotal(extra) {
  return packsOf(extra) * parseAmount(extra?.price);
}

// An extra's percent is the share of it its ADDER pays; the rest is charged
// to the other flatmate. Defaults to 50; 0 = fully charged to the other.
export function extraPercent(extra) {
  const n = parseFloat(extra?.percent);
  if (isNaN(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

// An extra splits into the share its adder pays (own) and the rest charged
// to the other flatmate. The own part is rounded to pence and the other
// derived by subtraction, so the parts always sum to the item's total
// exactly and displayed lines reconcile with card totals.
export function extraShares(extra) {
  const total = round2(extraTotal(extra));
  const own = round2((total * extraPercent(extra)) / 100);
  return { total, own, other: round2(total - own) };
}

// A person's extras as one list with a normalized percent on every item,
// where percent = the share the ADDER pays (marked percentOwn: true).
// Items saved before this flip stored the share charged to the OTHER
// flatmate — those (no marker) are inverted once here, so old drafts and
// history keep charging the same person. Legacy full-price lists fold in
// as 0% items (the adder pays nothing; the other flatmate pays it all).
export function mergedExtras(data, personKey) {
  const normalizeExtra = (e) => e.percentOwn
    ? { ...e, percent: extraPercent(e) }
    : { ...e, percent: Math.round((100 - extraPercent(e)) * 100) / 100, percentOwn: true };
  const own = (data[`${personKey}Extras`] || []).map(normalizeExtra);
  const legacyFull = (data[`${personKey}FullPriceExtras`] || []).map((e) => ({ ...e, percent: 0, percentOwn: true }));
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

  // Each extra's percent is the share its adder pays; the other flatmate is
  // charged the rest. Per-item rounded parts are summed so the itemized
  // lines always add up to the share exactly.
  const matiasItems = mergedExtras(data, 'matias');
  const rekaItems = mergedExtras(data, 'reka');
  const shareOf = (items, isOwn) => items.reduce(
    (sum, e) => round2(sum + extraShares(e)[isOwn ? 'own' : 'other']),
    0
  );

  // The four parts of the extras, per person: the share each keeps of their
  // own items, and the remainder charged to them from the other's items.
  const matiasOwnKept = shareOf(matiasItems, true);
  const rekaOwnKept = shareOf(rekaItems, true);
  const matiasFromReka = shareOf(rekaItems, false);
  const rekaFromMatias = shareOf(matiasItems, false);

  const matiasShareExtras = round2(matiasOwnKept + matiasFromReka);
  const rekaShareExtras = round2(rekaOwnKept + rekaFromMatias);
  // Every item's charged part + remainder equals its total, so this is the
  // exact sum of all item totals.
  const extrasTotal = round2(matiasShareExtras + rekaShareExtras);

  const matiasBeforeDiscounts = round2(matiasBillsShare + matiasShareExtras);
  const rekaBeforeDiscounts = round2(rekaBillsShare + rekaShareExtras);

  const matiasDiscountTotal = round2(sumDiscounts(data.matiasDiscounts, matiasBeforeDiscounts));
  const rekaDiscountTotal = round2(sumDiscounts(data.rekaDiscounts, rekaBeforeDiscounts));

  const matiasTotalDue = round2(matiasBeforeDiscounts - matiasDiscountTotal);
  const rekaTotalDue = round2(rekaBeforeDiscounts - rekaDiscountTotal);

  // What each person actually hands over this month. Whoever added an extra
  // already paid the shop for it in full, so their kept share of their OWN
  // items is money already spent and comes off their payment. What remains is
  // their bills share plus their share of the OTHER person's purchases, minus
  // their personal discounts. Only the adder's own kept share is deducted —
  // the share of the other person's items is still genuinely owed.
  const matiasToPay = round2(matiasTotalDue - matiasOwnKept);
  const rekaToPay = round2(rekaTotalDue - rekaOwnKept);

  // The single bank transfer that settles the month, given that Matias
  // fronts all the bills: Réka's payment minus what Matias owes her for her
  // purchases. Positive = Réka pays Matias; negative = Matias pays Réka.
  const netTransfer = round2(rekaToPay - matiasFromReka);

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
    matiasToPay,
    rekaToPay,
    netTransfer,
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
// Non-breaking spaces keep the parenthetical on one line when text wraps.
export function formatExtraLabel(extra) {
  return `${extra.thing || 'Unnamed item'} (${packsOf(extra)} × ${formatCurrency(extra.price)})`;
}
