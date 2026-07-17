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

// The split percent is flatmate 1 (flatmate1)'s share of all shared costs;
// flatmate 2 (flatmate2) pays the remainder. Invalid input falls back to 50/50.
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
  let flatmate1SharedShare = 0;
  let flatmate2SharedShare = 0;
  let flatmate1DiscountedBills = 0; // portions discounted for Flatmate2 — Flatmate1 covers them
  let flatmate2DiscountedBills = 0; // portions discounted for Flatmate1 — Flatmate2 covers them
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
    flatmate1SharedShare = round2(flatmate1SharedShare + mPart);
    flatmate2SharedShare = round2(flatmate2SharedShare + round2(shared - mPart));

    if (from === null) return;
    if (from === 'flatmate2') flatmate1DiscountedBills = round2(flatmate1DiscountedBills + portion);
    if (from === 'flatmate1') flatmate2DiscountedBills = round2(flatmate2DiscountedBills + portion);
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
  const flatmate1BillsShare = round2(flatmate1SharedShare + flatmate1DiscountedBills);
  const flatmate2BillsShare = round2(flatmate2SharedShare + flatmate2DiscountedBills);
  const billsTotal = round2(flatmate1BillsShare + flatmate2BillsShare);

  // Each extra's percent is the share its adder pays; the other flatmate is
  // charged the rest. Per-item rounded parts are summed so the itemized
  // lines always add up to the share exactly.
  const flatmate1Items = mergedExtras(data, 'flatmate1');
  const flatmate2Items = mergedExtras(data, 'flatmate2');
  const shareOf = (items, isOwn) => items.reduce(
    (sum, e) => round2(sum + extraShares(e)[isOwn ? 'own' : 'other']),
    0
  );

  // The four parts of the extras, per person: the share each keeps of their
  // own items, and the remainder charged to them from the other's items.
  const flatmate1OwnKept = shareOf(flatmate1Items, true);
  const flatmate2OwnKept = shareOf(flatmate2Items, true);
  const flatmate1FromFlatmate2 = shareOf(flatmate2Items, false);
  const flatmate2FromFlatmate1 = shareOf(flatmate1Items, false);

  const flatmate1ShareExtras = round2(flatmate1OwnKept + flatmate1FromFlatmate2);
  const flatmate2ShareExtras = round2(flatmate2OwnKept + flatmate2FromFlatmate1);
  // Every item's charged part + remainder equals its total, so this is the
  // exact sum of all item totals.
  const extrasTotal = round2(flatmate1ShareExtras + flatmate2ShareExtras);

  const flatmate1BeforeDiscounts = round2(flatmate1BillsShare + flatmate1ShareExtras);
  const flatmate2BeforeDiscounts = round2(flatmate2BillsShare + flatmate2ShareExtras);

  const flatmate1DiscountTotal = round2(sumDiscounts(data.flatmate1Discounts, flatmate1BeforeDiscounts));
  const flatmate2DiscountTotal = round2(sumDiscounts(data.flatmate2Discounts, flatmate2BeforeDiscounts));

  const flatmate1TotalDue = round2(flatmate1BeforeDiscounts - flatmate1DiscountTotal);
  const flatmate2TotalDue = round2(flatmate2BeforeDiscounts - flatmate2DiscountTotal);

  // What each person actually hands over this month. Whoever added an extra
  // already paid the shop for it in full, so their kept share of their OWN
  // items is money already spent and comes off their payment. What remains is
  // their bills share plus their share of the OTHER person's purchases, minus
  // their personal discounts. Only the adder's own kept share is deducted —
  // the share of the other person's items is still genuinely owed.
  const flatmate1ToPay = round2(flatmate1TotalDue - flatmate1OwnKept);
  const flatmate2ToPay = round2(flatmate2TotalDue - flatmate2OwnKept);

  // The single bank transfer that settles the month, given that Flatmate1
  // fronts all the bills: Flatmate2's payment minus what Flatmate1 owes her for her
  // purchases. Positive = Flatmate2 pays Flatmate1; negative = Flatmate1 pays Flatmate2.
  const netTransfer = round2(flatmate2ToPay - flatmate1FromFlatmate2);

  // The same transfer split by direction for the invoice's total-due lines:
  // each person's line IS the amount they send, no further math. At most one
  // is non-zero — normally Flatmate2's; a big Flatmate2 purchase can flip it.
  const flatmate2TransferDue = netTransfer > 0 ? netTransfer : 0;
  const flatmate1TransferDue = netTransfer < 0 ? round2(-netTransfer) : 0;

  // What the month effectively costs Flatmate1, mirroring Flatmate2's terms from
  // his side: his bills share, minus what she reimburses for his extras,
  // plus what he owes for hers, minus his own discounts. Discounts only
  // ever reduce their OWN flatmate's line — they represent money settled
  // outside the invoice, so the other side doesn't absorb them.
  const flatmate1EffectiveDue = round2(billsTotal - netTransfer - flatmate2DiscountTotal - flatmate1DiscountTotal);

  // The full price each person already paid the shop for their own items.
  // Subtracting it from their Net total gives their total due directly:
  // netTransfer = flatmate2TotalDue − flatmate2OwnExtrasPaid, and
  // flatmate1EffectiveDue = flatmate1TotalDue − flatmate1OwnExtrasPaid — which is
  // exactly how the invoice cards itemize the maths.
  const flatmate1OwnExtrasPaid = round2(flatmate1OwnKept + flatmate2FromFlatmate1);
  const flatmate2OwnExtrasPaid = round2(flatmate2OwnKept + flatmate1FromFlatmate2);

  return {
    splitPercent,
    billsTotal,
    billsRawTotal,
    billDiscountLines,
    flatmate1SharedShare,
    flatmate2SharedShare,
    flatmate1BillsShare,
    flatmate2BillsShare,
    flatmate1ShareExtras,
    flatmate2ShareExtras,
    flatmate1BeforeDiscounts,
    flatmate2BeforeDiscounts,
    flatmate1DiscountTotal,
    flatmate2DiscountTotal,
    flatmate1TotalDue,
    flatmate2TotalDue,
    flatmate1ToPay,
    flatmate2ToPay,
    netTransfer,
    flatmate1TransferDue,
    flatmate2TransferDue,
    flatmate1EffectiveDue,
    flatmate1OwnExtrasPaid,
    flatmate2OwnExtrasPaid,
    // Cross shares, for the totals card's breakdown lines:
    // toPay = own bills share + share of the OTHER's extras − own discounts.
    flatmate1ShareOfFlatmate2Extras: flatmate1FromFlatmate2,
    flatmate2ShareOfFlatmate1Extras: flatmate2FromFlatmate1,
    extrasTotal,
    // Grand total = charged bills + all extras, so it always equals the
    // Bills card total plus the Total extras line (and the flatmates' dues
    // before their personal discounts).
    grandTotal: round2(billsTotal + extrasTotal),
    netTotal: round2(flatmate1TotalDue + flatmate2TotalDue)
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
