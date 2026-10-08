// Locale-independent: compares UTF-16 code units, so order is the same on every machine.
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
