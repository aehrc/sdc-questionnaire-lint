import { expect, it } from 'vitest';
import * as plugin from '../src/index.js';

// Smoke test: the entry point loads. Replace with rule tests.
it('loads the plugin entry point', () => {
  expect(plugin).toBeDefined();
});
