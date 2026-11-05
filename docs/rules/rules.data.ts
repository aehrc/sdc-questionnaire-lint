/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { defineLoader } from 'vitepress';
import { ruleSummaries, type RuleSummary } from '../.vitepress/rules.js';

// The rules of each group, by group ID, for the library's index page.
export type Data = Record<string, RuleSummary[]>;

declare const data: Data;
export { data };

export default defineLoader({ load: ruleSummaries });
