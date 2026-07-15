export function parseAmount(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

export function packsOf(extra) {
  const n = parseInt(extra?.packs, 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

// An extra's price field is the price per pack; the charged amount is packs × price.
export function extraTotal(extra) {
  return packsOf(extra) * parseAmount(extra?.price);
}

export function sumExtras(extras) {
  return (extras || []).reduce((sum, e) => sum + extraTotal(e), 0);
}

// An extra's percent is the share of it charged to the OTHER flatmate
// (the one who didn't add it). Defaults to 50; 100 = fully charged over.
export function extraPercent(extra) {
  const n = parseFloat(extra?.percent);
  if (isNaN(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

// A person's extras as one list with a normalized percent on every item.
// Merges the legacy full-price list (pre-per-item-percent drafts/invoices)
// in as 100% items, so old data keeps computing identically.
export function mergedExtras(data, personKey) {
  const own = (data[`${personKey}Extras`] || []).map((e) => ({ ...e, percent: extraPercent(e) }));
  const legacyFull = (data[`${personKey}FullPriceExtras`] || []).map((e) => ({ ...e, percent: 100 }));
  return [...own, ...legacyFull];
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

  // Bills ticked as discounted stay listed on the invoice but are excluded
  // from the totals and both flatmates' shares.
  const billsTotal = (data.bills || []).reduce(
    (sum, b) => (b.discounted ? sum : sum + parseAmount(b.amount)),
    0
  );
  const matiasBillsShare = billsTotal * p;
  const rekaBillsShare = billsTotal * (1 - p);

  // Each extra charges its percent to the other flatmate; the person who
  // added it pays the remainder.
  const matiasItems = mergedExtras(data, 'matias');
  const rekaItems = mergedExtras(data, 'reka');
  const shareOf = (items, isOwn) => items.reduce((sum, e) => {
    const fraction = extraPercent(e) / 100;
    return sum + extraTotal(e) * (isOwn ? 1 - fraction : fraction);
  }, 0);

  const matiasShareExtras = shareOf(matiasItems, true) + shareOf(rekaItems, false);
  const rekaShareExtras = shareOf(rekaItems, true) + shareOf(matiasItems, false);

  const matiasBeforeDiscounts = matiasBillsShare + matiasShareExtras;
  const rekaBeforeDiscounts = rekaBillsShare + rekaShareExtras;

  const matiasDiscountTotal = sumDiscounts(data.matiasDiscounts, matiasBeforeDiscounts);
  const rekaDiscountTotal = sumDiscounts(data.rekaDiscounts, rekaBeforeDiscounts);

  const matiasTotalDue = matiasBeforeDiscounts - matiasDiscountTotal;
  const rekaTotalDue = rekaBeforeDiscounts - rekaDiscountTotal;

  return {
    splitPercent,
    billsTotal,
    billsTotalEach: billsTotal / 2,
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
    netTotal: matiasTotalDue + rekaTotalDue
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
