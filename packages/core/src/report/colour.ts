/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { Severity } from './types.js';

const codes: Record<Severity, number> = { error: 31, warning: 33, info: 34 };

// Only the severity word is ever coloured: red, yellow or blue.
export function paintSeverity(severity: Severity, colour: boolean): string {
  return colour ? `\u001b[${String(codes[severity])}m${severity}\u001b[39m` : severity;
}
