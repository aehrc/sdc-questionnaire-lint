import { defineConfig } from 'sdc-questionnaire-lint';
import { testPlugin } from '../plugins/test-plugin.mjs';

export default defineConfig({
  plugins: [testPlugin()],
  rules: { 'test/second-rule': 'off', 'test/finding-per-questionnaire': 'error' },
});
