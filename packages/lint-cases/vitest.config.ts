import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'lint-cases',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
  },
});
