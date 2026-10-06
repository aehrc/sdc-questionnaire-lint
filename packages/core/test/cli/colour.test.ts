import { describe, expect, it } from 'vitest';
import { colourEnabled } from '../../src/cli/colour.js';

function io(isTTY: boolean | undefined, env: Record<string, string | undefined> = {}) {
  return { stdout: { write: () => undefined, ...(isTTY === undefined ? {} : { isTTY }) }, env };
}

describe('colourEnabled', () => {
  it('is on for a terminal', () => {
    expect(colourEnabled(io(true))).toBe(true);
  });

  it('is off when NO_COLOR is set', () => {
    expect(colourEnabled(io(true, { NO_COLOR: '1' }))).toBe(false);
  });

  it('ignores an empty NO_COLOR', () => {
    expect(colourEnabled(io(true, { NO_COLOR: '' }))).toBe(true);
  });

  it('is off when stdout is not a terminal', () => {
    expect(colourEnabled(io(false))).toBe(false);
    expect(colourEnabled(io(undefined))).toBe(false);
  });

  it('does not depend on CI', () => {
    expect(colourEnabled(io(true, { CI: 'true' }))).toBe(true);
    expect(colourEnabled(io(false, { CI: 'true' }))).toBe(false);
  });
});
