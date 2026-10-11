import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'plugin-smart-forms',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
  },
});
