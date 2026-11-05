/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type { LintRule, RuleContext } from './contract.js';

// A built-in sdc rule that reads core's analysis of the document. The runner passes the analysis
// as a second argument to sdc rules only; plugin rules keep the public RuleContext, which has the
// references, available variables and declarations (API stages B and B2) but not the rest.
export interface CoreRule {
  meta: LintRule['meta'];
  check(ctx: RuleContext, analysis: DocumentAnalysis): void;
}
