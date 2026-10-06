import pkg from '../../package.json' with { type: 'json' };
import { parseError } from '../rules/parse-error.js';
import { uncataloguedExpression } from '../rules/uncatalogued-expression.js';
import { unknownFunction } from '../rules/unknown-function.js';
import type { LintPlugin } from './types.js';

// Core rules (core-plan §4.1). Rules are added as the analysis engine is built.
export const sdcPlugin: LintPlugin = {
  meta: { name: 'sdc', version: pkg.version },
  rules: {
    'parse-error': parseError,
    'uncatalogued-expression': uncataloguedExpression,
    'unknown-function': unknownFunction,
  },
};
