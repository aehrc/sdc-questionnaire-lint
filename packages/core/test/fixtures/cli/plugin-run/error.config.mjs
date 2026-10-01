import { defineConfig } from 'sdc-questionnaire-lint';
import { testPlugin } from '../../plugins/test-plugin.mjs';

export default defineConfig({
  plugins: [testPlugin({ severity: 'error' })],
  rules: { 'test/second-rule': 'off' },
});
