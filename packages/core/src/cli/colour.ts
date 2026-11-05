/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { CliIo } from './run.js';

// Colour only for a terminal, and never when NO_COLOR is set to a non-empty value (no-color.org).
// Nothing else changes output: not CI, not agent detection.
export function colourEnabled(io: Pick<CliIo, 'stdout' | 'env'>): boolean {
  return io.stdout.isTTY === true && !io.env.NO_COLOR;
}
