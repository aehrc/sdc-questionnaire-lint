// The config that npm run corpus -- --smart-forms lints the corpus with: the built plugin, checked
// against the newest verified Smart Forms versions (docs/smart-forms-rules.md, P0).
import smartForms from '../dist/index.js';

export default {
  plugins: [smartForms],
  compat: { 'smart-forms': 'latest' },
};
