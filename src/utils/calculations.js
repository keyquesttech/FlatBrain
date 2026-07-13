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

  const billsTotal = (data.bills || []).reduce((sum, b) => sum + parseAmount(b.amount), 0);
  const flatmate1BillsShare = billsTotal * p;
  const flatmate2BillsShare = billsTotal * (1 - p);

  const flatmate1Regular = sumExtras(data.flatmate1Extras);
  const flatmate2Regular = sumExtras(data.flatmate2Extras);
  const flatmate1FullPrice = sumExtras(data.flatmate1FullPriceExtras);
  const flatmate2FullPrice = sumExtras(data.flatmate2FullPriceExtras);

  const regularTotal = flatmate1Regular + flatmate2Regular;
  const flatmate1ShareExtras = regularTotal * p + flatmate2FullPrice;
  const flatmate2ShareExtras = regularTotal * (1 - p) + flatmate1FullPrice;

  const flatmate1BeforeDiscounts = flatmate1BillsShare + flatmate1ShareExtras;
  const flatmate2BeforeDiscounts = flatmate2BillsShare + flatmate2ShareExtras;

  const flatmate1DiscountTotal = sumDiscounts(data.flatmate1Discounts, flatmate1BeforeDiscounts);
  const flatmate2DiscountTotal = sumDiscounts(data.flatmate2Discounts, flatmate2BeforeDiscounts);

  const flatmate1TotalDue = flatmate1BeforeDiscounts - flatmate1DiscountTotal;
  const flatmate2TotalDue = flatmate2BeforeDiscounts - flatmate2DiscountTotal;

  return {
    splitPercent,
    billsTotal,
    billsTotalEach: billsTotal / 2,
    flatmate1BillsShare,
    flatmate2BillsShare,
    flatmate1Regular,
    flatmate2Regular,
    flatmate1FullPrice,
    flatmate2FullPrice,
    flatmate1ShareExtras,
    flatmate2ShareExtras,
    flatmate1BeforeDiscounts,
    flatmate2BeforeDiscounts,
    flatmate1DiscountTotal,
    flatmate2DiscountTotal,
    flatmate1TotalDue,
    flatmate2TotalDue,
    netTotal: flatmate1TotalDue + flatmate2TotalDue
  };
}

export function getInvoiceExtrasSection(personKey, data) {
  const otherKey = personKey === 'flatmate1' ? 'flatmate2' : 'flatmate1';
  const regular = data[`${personKey}Extras`] || [];
  const fromOtherFullPrice = (data[`${otherKey}FullPriceExtras`] || []).map((e) => ({
    ...e,
    fullPriceFrom: otherKey
  }));

  const items = [...regular, ...fromOtherFullPrice];
  const regularTotal = sumExtras(regular);
  const fullPriceTotal = sumExtras(fromOtherFullPrice);
  const total = regularTotal + fullPriceTotal;
  const totalEach = regularTotal / 2 + fullPriceTotal;

  return { items, regularTotal, fullPriceTotal, total, totalEach };
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP'
});

export function formatCurrency(amount) {
  return GBP.format(parseAmount(amount));
}

// Always shows the pack count and per-pack price, e.g. "Bulbs (2 × £7.50)".
export function formatExtraLabel(extra, names) {
  const packs = ` (${packsOf(extra)} × ${formatCurrency(extra.price)})`;
  if (extra.fullPriceFrom) {
    const fromName = names[extra.fullPriceFrom] || extra.fullPriceFrom;
    return `${extra.thing || 'Unnamed item'}${packs} (full price from ${fromName})`;
  }
  return `${extra.thing || 'Unnamed item'}${packs}`;
}
