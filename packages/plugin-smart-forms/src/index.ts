import type { LintPlugin } from 'sdc-questionnaire-lint';
import pkg from '../package.json' with { type: 'json' };
import { hostVariables } from './host-variables.js';
import { expressionEvaluatedAsFhirpath } from './rules/expression-evaluated-as-fhirpath.js';
import { forwardVariableReference } from './rules/forward-variable-reference.js';
import { namedExpressionNotReferenceable } from './rules/named-expression-not-referenceable.js';
import { questionnaireVariableUnavailable } from './rules/questionnaire-variable-unavailable.js';
import { repeatingGroupVariable } from './rules/repeating-group-variable.js';
import { unsupportedExpressionLanguage } from './rules/unsupported-expression-language.js';
import { unsupportedQueryEmbedding } from './rules/unsupported-query-embedding.js';
import { variableNameCollision } from './rules/variable-name-collision.js';

// The Smart Forms plugin. Listing it in plugins checks forms against the Smart Forms versions
// selected in compat (docs/smart-forms-rules.md).
const smartForms: LintPlugin = {
  meta: { name: 'smart-forms', version: pkg.version },
  rules: {
    'unsupported-expression-language': unsupportedExpressionLanguage,
    'expression-evaluated-as-fhirpath': expressionEvaluatedAsFhirpath,
    'questionnaire-variable-unavailable': questionnaireVariableUnavailable,
    'unsupported-query-embedding': unsupportedQueryEmbedding,
    'variable-name-collision': variableNameCollision,
    'repeating-group-variable': repeatingGroupVariable,
    'named-expression-not-referenceable': namedExpressionNotReferenceable,
    'forward-variable-reference': forwardVariableReference,
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
  // The sourceQueries results population binds, so that sdc/undefined-variable accepts them.
  hostVariables,
};

export default smartForms;
