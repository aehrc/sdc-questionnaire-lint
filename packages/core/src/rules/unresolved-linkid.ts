/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type { ExpressionSite } from '../analysis/expression-site.js';
import type { CoreRule } from '../plugins/core-rule.js';
import { closestName } from '../suggest.js';

// Whether the rule completes its check at a site: its FHIRPath parses, and the target and linkId
// of every reference other than an absence probe are established (D6).
export function completesLinkIdCheck(site: ExpressionSite, analysis: DocumentAnalysis): boolean {
  return analysis.linkIdReferences.get(site)?.uncertain === false;
}

// Whether the rule applies at a site but cannot complete there: a reference has a target or linkId
// that is not established. A site with no reference is not one of these.
export function leavesLinkIdCheckIncomplete(
  site: ExpressionSite,
  analysis: DocumentAnalysis,
): boolean {
  return analysis.linkIdReferences.get(site)?.uncertain === true;
}

const message = (linkId: string): string => `No item in this Questionnaire has linkId '${linkId}'.`;

export const unresolvedLinkId: CoreRule = {
  meta: {
    description: 'Reports a literal linkId that no item in the Questionnaire has.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        "Looks at each where(linkId = '…') in a FHIRPath expression, and in each {{…}} fragment " +
        'of an x-fhir-query, that selects items of this form: from %questionnaire, %resource ' +
        'or %context, from %qitem on an item, or from the expression’s own input, through ' +
        'item, answer, repeat(…), where(…) and select(…). The linkId must be the linkId of ' +
        'an item somewhere in the Questionnaire; whether the selection reaches that item’s ' +
        'depth is not checked.',
      why:
        'A linkId that no item has selects nothing, so the expression silently works on an ' +
        'empty value. It is usually a typo, or an item that was renamed or removed. An empty ' +
        'selection is not always a mistake, so the rule is a warning; a project that requires ' +
        'literal linkIds to name existing items can configure it as an error.',
      exampleMessage: message('smokr'),
      fix:
        'Correct the linkId in the FSH rule that sets the expression, or add the item, then ' +
        'run SUSHI again. The help names an existing linkId that is similar, when there is one.',
      limitations:
        'A selection consumed by exists(), empty() or a count() comparison is taken to test ' +
        'deliberately whether the item is present, and is not reported. A linkId is not ' +
        'checked, and the expression counts as unchecked, when it is computed, or when what ' +
        'it selects from is not known to be this form: another variable, %previousResponse, ' +
        'descendants(), which reaches contained resources, or an input that a function such ' +
        'as first() changes. Nothing is checked in a Questionnaire that includes modules or is ' +
        'one, whose assembled form has other items, nor in contained resources, at ' +
        'uncatalogued locations or in other languages. Other ways to compare a linkId, such ' +
        "as linkId != '…', or a comparison joined to another by and or or, are not checked.",
    },
  },
  check(ctx, { linkIds, linkIdReferences }) {
    for (const site of ctx.sites) {
      for (const { linkId, startOffset, endOffset } of linkIdReferences.get(site)?.literals ?? []) {
        if (linkIds.has(linkId)) continue;
        const similar = closestName(linkId, linkIds);
        ctx.report({
          site,
          message: message(linkId),
          help:
            similar === undefined
              ? `correct the linkId, or add an item with linkId '${linkId}'`
              : `an item with a similar linkId exists: '${similar}'`,
          range: { startOffset, endOffset },
        });
      }
    }
  },
};
