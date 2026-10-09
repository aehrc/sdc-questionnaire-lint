import type { LintPlugin } from 'sdc-questionnaire-lint';
import pkg from '../package.json' with { type: 'json' };

// The Smart Forms plugin. Listing it in plugins checks forms against the Smart Forms versions
// selected in compat; it has no rules yet (docs/smart-forms-rules.md, P0).
const smartForms: LintPlugin = {
  meta: { name: 'smart-forms', version: pkg.version },
  rules: {},
  compat: {
    // Oldest to newest: "latest" selects the last. Each version is verified on its own (S3).
    verified: {
      renderer: ['1.4.0'],
      populate: ['4.7.1'],
      'template-extract': ['1.0.15'],
    },
    // Template extraction is checked only when selected.
    required: ['renderer', 'populate'],
  },
};

export default smartForms;
