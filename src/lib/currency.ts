// Single source of truth for how money is shown in the UI: Indian Rupees with
// Indian digit grouping (₹2,10,759.00). Only the display changes — amounts are
// stored and calculated exactly as before, with no conversion applied.

export const CURRENCY_CODE = 'INR';
export const CURRENCY_LOCALE = 'en-IN';
export const CURRENCY_SYMBOL = '₹';

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
      style: 'currency',
      currency: CURRENCY_CODE,
      ...options,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

// Avoid showing "-₹0.00" for negative zero.
const normalize = (amount: number) => (Object.is(amount, -0) ? 0 : amount);

/** Money amounts with exactly two decimals, e.g. ₹2,10,759.00 or -₹1,234.50. */
export function formatCurrency(amount: number): string {
  return getFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    normalize(amount),
  );
}

/** Prices: whole amounts without decimals (₹999), others with two (₹12.50). */
export function formatPrice(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return getFormatter({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    normalize(amount),
  );
}

/** Short labels for chart axes and headline stats, e.g. ₹2L or ₹1.5Cr. */
export function formatCurrencyCompact(amount: number): string {
  return getFormatter({ notation: 'compact', maximumFractionDigits: 1 }).format(
    normalize(amount),
  );
}
