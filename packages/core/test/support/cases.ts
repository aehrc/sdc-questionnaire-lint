import { lintCases } from '@sdc-questionnaire-lint/lint-cases';
import { lint } from '../../src/index.js';

// Core's lint cases, test/cases/<group>/<case>.yaml, linted by core's source.
export const coreCases = lintCases({ casesDirectory: new URL('../cases/', import.meta.url), lint });
