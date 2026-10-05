import type { CliIo } from './run.js';

// Colour only for a terminal, and never when NO_COLOR is set to a non-empty value (no-color.org).
// Nothing else changes output: not CI, not agent detection.
export function colourEnabled(io: Pick<CliIo, 'stdout' | 'env'>): boolean {
  return io.stdout.isTTY === true && !io.env.NO_COLOR;
}
