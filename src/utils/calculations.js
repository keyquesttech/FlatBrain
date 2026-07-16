export function parseAmount(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// All computed amounts round to whole pence (0.00) so displayed lines and
// totals always agree.
export function round2(n) {
  return Math.round(n * 100) / 100;
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

// The split percent is flatmate 1 (flatmate1)'s share of all shared costs;
// flatmate 2 (flatmate2) pays the remainder. Invalid input falls back to 50/50.
export function clampSplitPercent(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

// A discount is { thing, type: 'amount'|'percent', value }. Percent discounts
// apply to that person's pre-discount total (bills share + extras share).
export function discountAmount(discount, base) {
  const v = parseAmount(discount?.value);
  return discount?.type === 'percent' ? (base * v) / 100 : v;
}

export function sumDiscounts(discounts, base) {
  return (discounts || []).reduce((sum, d) => sum + discountAmount(d, base), 0);
}

export function calculateInvoice(data) {
  const splitPercent = clampSplitPercent(data.splitPercent ?? 50);
  const p = splitPercent / 100;

  // Undiscounted bills are split between the flatmates at the split percent.
  // A bill "discounted for" one flatmate is charged in full to the other;
  // with discountedFrom 'na' (or unset) the whole bill is waived and nobody
  // pays. Per shared bill one part is rounded to pence and the other derived
  // by subtraction, so the two shares always sum to the charged total exactly.
  let flatmate1SharedShare = 0;
  let flatmate2SharedShare = 0;
  let flatmate1DiscountedBills = 0; // bills discounted for Flatmate2 — Flatmate1 pays them in full
  let flatmate2DiscountedBills = 0; // bills discounted for Flatmate1 — Flatmate2 pays them in full
  let billsRawTotal = 0;
  const billDiscountLines = [];
  (data.bills || []).forEach((b) => {
    const amount = round2(parseAmount(b.amount));
    const from = b.discounted ? (b.discountedFrom || 'na') : null;
    billsRawTotal = round2(billsRawTotal + amount);

    if (from === null) {
      const mPart = round2(amount * p);
      flatmate1SharedShare = round2(flatmate1SharedShare + mPart);
      flatmate2SharedShare = round2(flatmate2SharedShare + round2(amount - mPart));
      return;
    }
    if (from === 'flatmate2') flatmate1DiscountedBills = round2(flatmate1DiscountedBills + amount);
    if (from === 'flatmate1') flatmate2DiscountedBills = round2(flatmate2DiscountedBills + amount);
    billDiscountLines.push({
      id: b.id,
      thing: b.thing,
      from,
      amount,
      waived: from === 'na' ? amount : 0
    });
  });
  const flatmate1BillsShare = round2(flatmate1SharedShare + flatmate1DiscountedBills);
  const flatmate2BillsShare = round2(flatmate2SharedShare + flatmate2DiscountedBills);
  const billsTotal = round2(flatmate1BillsShare + flatmate2BillsShare);

  // Each extra charges its percent to the other flatmate; the person who
  // added it pays the remainder. Per-item rounded parts are summed so the
  // itemized lines always add up to the share exactly.
  const flatmate1Items = mergedExtras(data, 'flatmate1');
  const flatmate2Items = mergedExtras(data, 'flatmate2');
  const shareOf = (items, isOwn) => items.reduce(
    (sum, e) => round2(sum + extraShares(e)[isOwn ? 'remainder' : 'charged']),
    0
  );

  const flatmate1ShareExtras = round2(shareOf(flatmate1Items, true) + shareOf(flatmate2Items, false));
  const flatmate2ShareExtras = round2(shareOf(flatmate2Items, true) + shareOf(flatmate1Items, false));
  // Every item's charged part + remainder equals its total, so this is the
  // exact sum of all item totals.
  const extrasTotal = round2(flatmate1ShareExtras + flatmate2ShareExtras);

  const flatmate1BeforeDiscounts = round2(flatmate1BillsShare + flatmate1ShareExtras);
  const flatmate2BeforeDiscounts = round2(flatmate2BillsShare + flatmate2ShareExtras);

  const flatmate1DiscountTotal = round2(sumDiscounts(data.flatmate1Discounts, flatmate1BeforeDiscounts));
  const flatmate2DiscountTotal = round2(sumDiscounts(data.flatmate2Discounts, flatmate2BeforeDiscounts));

  const flatmate1TotalDue = round2(flatmate1BeforeDiscounts - flatmate1DiscountTotal);
  const flatmate2TotalDue = round2(flatmate2BeforeDiscounts - flatmate2DiscountTotal);

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
export function formatExtraLabel(extra) {
  return `${extra.thing || 'Unnamed item'} (${packsOf(extra)} × ${formatCurrency(extra.price)})`;
}
