// Server-side counterpart of src/lib/currency.ts, for text the API generates
// (reminder messages, validation errors). Display only: amounts are not
// converted, just shown as Indian Rupees with Indian digit grouping.

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWholeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** e.g. ₹2,10,759.00 */
export function formatCurrency(amount: number): string {
  return inrFormatter.format(Object.is(amount, -0) ? 0 : amount);
}

/** Whole-rupee amounts for limits in messages, e.g. ₹9,99,999 */
export function formatWholeCurrency(amount: number): string {
  return inrWholeFormatter.format(amount);
}
