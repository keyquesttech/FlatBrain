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

  // Discounted bills stay listed on the invoice but aren't charged: with
  // discountedFrom 'na' (or unset) the whole bill is waived; with a flatmate
  // selected only that person's share is waived — the other still pays theirs.
  // Per bill, one part is rounded to pence and the rest derived by
  // subtraction, so parts + waived always equal the bill exactly and every
  // displayed total reconciles.
  let flatmate1BillsShare = 0;
  let flatmate2BillsShare = 0;
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
    } else if (from === 'flatmate2') {
      mPart = round2(amount * p);
    } else if (from === 'flatmate1') {
      rPart = round2(amount * (1 - p));
    }
    flatmate1BillsShare = round2(flatmate1BillsShare + mPart);
    flatmate2BillsShare = round2(flatmate2BillsShare + rPart);

    if (from !== null) {
      billDiscountLines.push({
        id: b.id,
        thing: b.thing,
        from,
        waived: round2(amount - mPart - rPart)
      });
    }
  });
  const billsTotal = round2(flatmate1BillsShare + flatmate2BillsShare);

  // Each extra charges its percent to the other flatmate; the person who
  // added it pays the remainder.
  const flatmate1Items = mergedExtras(data, 'flatmate1');
  const flatmate2Items = mergedExtras(data, 'flatmate2');
  const shareOf = (items, isOwn) => items.reduce((sum, e) => {
    const fraction = extraPercent(e) / 100;
    return sum + extraTotal(e) * (isOwn ? 1 - fraction : fraction);
  }, 0);

  const flatmate1ShareExtras = round2(shareOf(flatmate1Items, true) + shareOf(flatmate2Items, false));
  const flatmate2ShareExtras = round2(shareOf(flatmate2Items, true) + shareOf(flatmate1Items, false));

  const flatmate1BeforeDiscounts = round2(flatmate1BillsShare + flatmate1ShareExtras);
  const flatmate2BeforeDiscounts = round2(flatmate2BillsShare + flatmate2ShareExtras);

  const flatmate1DiscountTotal = round2(sumDiscounts(data.flatmate1Discounts, flatmate1BeforeDiscounts));
  const flatmate2DiscountTotal = round2(sumDiscounts(data.flatmate2Discounts, flatmate2BeforeDiscounts));

  const flatmate1TotalDue = round2(flatmate1BeforeDiscounts - flatmate1DiscountTotal);
  const flatmate2TotalDue = round2(flatmate2BeforeDiscounts - flatmate2DiscountTotal);

  return {
    splitPercent,
    billsTotal,
    billsTotalEach: round2(billsTotal / 2),
    billsRawTotal,
    billDiscountLines,
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
