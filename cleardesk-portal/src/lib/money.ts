const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** 123456 -> "$1,234.56" */
export function usd(cents: number): string {
  return fmt.format(cents / 100);
}

/** "1,234.56" or "$1234.5" -> 123456. Returns null when it isn't a number. */
export function parseUsd(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
