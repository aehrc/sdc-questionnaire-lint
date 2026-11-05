/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { lintCases } from '@aehrc/sdc-questionnaire-lint-cases';
import { lint } from '../../src/index.js';

// Core's lint cases, test/cases/<group>/<case>.yaml, linted by core's source.
export const coreCases = lintCases({ casesDirectory: new URL('../cases/', import.meta.url), lint });
