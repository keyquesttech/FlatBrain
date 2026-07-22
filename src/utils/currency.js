// Panel-wide currency. The ISO code lives in settings.json; App applies it
// at boot (and Settings live on change) before any page renders, so
// formatCurrency and the symbol prefixes never show a stale currency.
// Amounts are plain numbers everywhere — switching currency changes the
// symbol shown, it never converts anything.
const LOCALE = 'en-GB';
const FALLBACK_CODE = 'GBP';

// narrowSymbol keeps foreign currencies short ($ instead of US$, Kč
// instead of CZK); very old engines without it fall back to the default.
function makeFormatter(code) {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' });
  } catch {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code });
  }
}

function symbolOf(formatter) {
  return formatter.formatToParts(0).find((p) => p.type === 'currency')?.value || FALLBACK_CODE;
}

let formatter = makeFormatter(FALLBACK_CODE);
let code = FALLBACK_CODE;
let symbol = symbolOf(formatter);

// The codes the Settings picker offers. name is for the picker label; the
// symbol comes from Intl so it always matches what formatMoney prints.
export const CURRENCIES = [
  { code: 'GBP', name: 'Pound sterling' },
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US dollar' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'PLN', name: 'Polish złoty' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'SEK', name: 'Swedish krona' }
];

export function setCurrencyCode(next) {
  if (typeof next !== 'string' || !/^[A-Za-z]{3}$/.test(next)) return;
  try {
    const f = makeFormatter(next.toUpperCase());
    formatter = f;
    code = next.toUpperCase();
    symbol = symbolOf(f);
  } catch { /* unknown code — keep the current currency */ }
}

export function currencyCode() {
  return code;
}

// For the few labels that show a bare symbol next to their own number
// (chart bars, input prefixes) rather than a fully formatted amount.
export function currencySymbol() {
  return symbol;
}

export function currencySymbolFor(codeFor) {
  try {
    return symbolOf(makeFormatter(codeFor));
  } catch {
    return codeFor;
  }
}

export function formatMoney(n) {
  return formatter.format(n);
}
