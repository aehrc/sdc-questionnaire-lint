import type { Severity } from './types.js';

const codes: Record<Severity, number> = { error: 31, warning: 33, info: 34 };

// Only the severity word is ever coloured: red, yellow or blue.
export function paintSeverity(severity: Severity, colour: boolean): string {
  return colour ? `\u001b[${String(codes[severity])}m${severity}\u001b[39m` : severity;
}
