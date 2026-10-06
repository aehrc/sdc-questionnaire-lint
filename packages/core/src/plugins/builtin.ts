import pkg from '../../package.json' with { type: 'json' };
import { fragmentParseError } from '../rules/fragment-parse-error.js';
import { parseError } from '../rules/parse-error.js';
import { querySyntax } from '../rules/query-syntax.js';
import { uncataloguedExpression } from '../rules/uncatalogued-expression.js';
import { unknownFunction } from '../rules/unknown-function.js';
import type { LintPlugin } from './types.js';

// Core rules (core-plan §4.1). Rules are added as the analysis engine is built.
export const sdcPlugin: LintPlugin = {
  meta: { name: 'sdc', version: pkg.version },
  rules: {
    'fragment-parse-error': fragmentParseError,
    'parse-error': parseError,
    'query-syntax': querySyntax,
    'uncatalogued-expression': uncataloguedExpression,
    'unknown-function': unknownFunction,
  },
};
