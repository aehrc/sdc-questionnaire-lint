/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { testLintCases } from '@aehrc/sdc-questionnaire-lint-cases';
import { sdcPlugin } from '../../src/plugins/builtin.js';
import { coreCases } from '../support/cases.js';

// Each case is a YAML config beside the findings the linter must report for it. Run
// `npx vitest run -u test/cases` to write the expected files, then review them.
testLintCases(coreCases, sdcPlugin);
