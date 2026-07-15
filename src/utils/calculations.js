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

  // Discounted bills stay listed on the invoice but aren't charged: with
  // discountedFrom 'na' (or unset) the whole bill is waived; with a flatmate
  // selected only that person's share is waived — the other still pays theirs.
  // Per bill, one part is rounded to pence and the rest derived by
  // subtraction, so parts + waived always equal the bill exactly and every
  // displayed total reconciles.
  let matiasBillsShare = 0;
  let rekaBillsShare = 0;
  let billsRawTotal = 0;
  const billDiscountLines = [];
  (data.bills || []).forEach((b) => {
    const amount = round2(parseAmount(b.amount));
    const from = b.discounted ? (b.discountedFrom || 'na') : null;
    billsRawTotal = round2(billsRawTotal + amount);

    let mPart = 0;
    let rPart = 0;
    if (from === null) {
      mPart = round2(amount * p);
      rPart = round2(amount - mPart);
    } else if (from === 'reka') {
      mPart = round2(amount * p);
    } else if (from === 'matias') {
      rPart = round2(amount * (1 - p));
    }
    matiasBillsShare = round2(matiasBillsShare + mPart);
    rekaBillsShare = round2(rekaBillsShare + rPart);

    if (from !== null) {
      billDiscountLines.push({
        id: b.id,
        thing: b.thing,
        from,
        waived: round2(amount - mPart - rPart)
      });
    }
  });
  const billsTotal = round2(matiasBillsShare + rekaBillsShare);

  // Each extra charges its percent to the other flatmate; the person who
  // added it pays the remainder.
  const matiasItems = mergedExtras(data, 'matias');
  const rekaItems = mergedExtras(data, 'reka');
  const shareOf = (items, isOwn) => items.reduce((sum, e) => {
    const fraction = extraPercent(e) / 100;
    return sum + extraTotal(e) * (isOwn ? 1 - fraction : fraction);
  }, 0);

  const matiasShareExtras = round2(shareOf(matiasItems, true) + shareOf(rekaItems, false));
  const rekaShareExtras = round2(shareOf(rekaItems, true) + shareOf(matiasItems, false));

  const matiasBeforeDiscounts = round2(matiasBillsShare + matiasShareExtras);
  const rekaBeforeDiscounts = round2(rekaBillsShare + rekaShareExtras);

  const matiasDiscountTotal = round2(sumDiscounts(data.matiasDiscounts, matiasBeforeDiscounts));
  const rekaDiscountTotal = round2(sumDiscounts(data.rekaDiscounts, rekaBeforeDiscounts));

  const matiasTotalDue = round2(matiasBeforeDiscounts - matiasDiscountTotal);
  const rekaTotalDue = round2(rekaBeforeDiscounts - rekaDiscountTotal);

  return {
    splitPercent,
    billsTotal,
    billsTotalEach: round2(billsTotal / 2),
    billsRawTotal,
    billDiscountLines,
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
