import type { LintPlugin } from 'sdc-questionnaire-lint';
import pkg from '../package.json' with { type: 'json' };
import { expressionEvaluatedAsFhirpath } from './rules/expression-evaluated-as-fhirpath.js';
import { questionnaireVariableUnavailable } from './rules/questionnaire-variable-unavailable.js';
import { unsupportedExpressionLanguage } from './rules/unsupported-expression-language.js';
import { unsupportedQueryEmbedding } from './rules/unsupported-query-embedding.js';

// The Smart Forms plugin. Listing it in plugins checks forms against the Smart Forms versions
// selected in compat (docs/smart-forms-rules.md).
const smartForms: LintPlugin = {
  meta: { name: 'smart-forms', version: pkg.version },
  rules: {
    'unsupported-expression-language': unsupportedExpressionLanguage,
    'expression-evaluated-as-fhirpath': expressionEvaluatedAsFhirpath,
    'questionnaire-variable-unavailable': questionnaireVariableUnavailable,
    'unsupported-query-embedding': unsupportedQueryEmbedding,
  },
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
