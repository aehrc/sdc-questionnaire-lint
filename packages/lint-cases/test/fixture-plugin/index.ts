/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { LintPlugin } from '@aehrc/sdc-questionnaire-lint';
// A relative import of another TypeScript file, which only loads when Vitest transforms the
// generated linter config that imports this plugin.
import { declaration } from './rule.js';

const fixture: LintPlugin = {
  meta: { name: 'fixture', version: '0.0.0' },
  rules: { declaration },
};

export default fixture;
