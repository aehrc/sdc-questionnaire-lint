/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { LintRule, QuestionnaireDocument } from '@aehrc/sdc-questionnaire-lint';
import { elementName, extensionOf, isObject } from '../document.js';
import { readBy, requireCompat } from '../eligibility.js';
import { ignores } from '../facts/languages.js';
import {
  ANSWER_EXPRESSION,
  CALCULATED_EXPRESSION,
  CQF_EXPRESSION,
  ENABLE_WHEN_EXPRESSION,
  FHIRPATH,
  INITIAL_EXPRESSION,
  VARIABLE,
  X_FHIR_QUERY,
} from '../urls.js';
import {
  coreReportsLanguage,
  extensionName,
  isLanguageSite,
  type LanguageSite,
} from './language-sites.js';

// The locations where the renderer uses every text/fhirpath extension of a URL, or the first, and
// ignores the others.
const filtering: readonly string[] = [
  CALCULATED_EXPRESSION,
  ENABLE_WHEN_EXPRESSION,
  ANSWER_EXPRESSION,
  CQF_EXPRESSION,
];

// What is lost when the expression is ignored, by location.
function consequence(site: LanguageSite): string {
  switch (site.location.url) {
    case VARIABLE:
      // Another declaration may still supply the name, so expressions using it need not fail.
      return `this variable never sets %${site.name ?? ''}`;
    case CALCULATED_EXPRESSION:
      return 'the answer is never calculated from it';
    case ENABLE_WHEN_EXPRESSION:
      // The item's enableWhen and hidden still apply.
      return 'this expression never disables the item';
    case ANSWER_EXPRESSION:
      // answerOption and answerValueSet still load.
      return 'its answers are not computed from it';
    default:
      return site.element === 'answerValueSet'
        ? 'the answer value set is not computed from it'
        : `the ${site.element ?? 'text'} is not updated from it`;
  }
}

const message = (extension: string, element: string, language: string, lost: string): string =>
  `Smart Forms ignores this ${extension} on ${element} because it is written in ${language}; ` +
  `it uses only text/fhirpath here, so ${lost}.`;

// A runtime reason, not a spelling one, so it does not contradict core's rule against suggesting
// the R4 code for the R5 one.
const queryCodeHelp =
  'set the language of this variable to application/x-fhir-query: Smart Forms runs a query in ' +
  'a variable only with that code';
const rewriteHelp =
  'rewrite it in FHIRPath with the language text/fhirpath; to use server data, fetch it in an ' +
  'application/x-fhir-query variable on this item or an ancestor and reference that variable';

// The other extensions on the same element as the site's extension.
function siblingsOf(document: QuestionnaireDocument, site: LanguageSite): unknown[] {
  const holder = extensionOf(document, site)?.holder;
  return holder === undefined ? [] : holder.siblings.filter((_, index) => index !== holder.index);
}

// The locations where the renderer uses only the first text/fhirpath extension of a URL; at the
// other filtering locations it uses every one with expression text.
const firstOnly: readonly string[] = [ENABLE_WHEN_EXPRESSION, ANSWER_EXPRESSION];

// Whether the renderer runs a text/fhirpath extension of the same URL on the element instead: the
// ignored one is then an alternative, not lost behaviour. One without expression text runs nothing.
function hasFhirPathAlternative(document: QuestionnaireDocument, site: LanguageSite): boolean {
  const alternatives = siblingsOf(document, site).flatMap((each) =>
    isObject(each) &&
    each.url === site.location.url &&
    isObject(each.valueExpression) &&
    each.valueExpression.language === FHIRPATH
      ? [each.valueExpression]
      : [],
  );
  const used = firstOnly.includes(site.location.url) ? alternatives.slice(0, 1) : alternatives;
  return used.some(({ expression }) => typeof expression === 'string' && expression !== '');
}

// Whether the element has a variable of the same name that Smart Forms accepts, which sets the
// name; sdc/duplicate-declaration reports the duplicate.
function hasAcceptedNamesake(document: QuestionnaireDocument, site: LanguageSite): boolean {
  return siblingsOf(document, site).some(
    (each) =>
      isObject(each) &&
      each.url === VARIABLE &&
      isObject(each.valueExpression) &&
      each.valueExpression.name === site.name &&
      (each.valueExpression.language === FHIRPATH ||
        each.valueExpression.language === X_FHIR_QUERY),
  );
}

export const unsupportedExpressionLanguage: LintRule = {
  meta: {
    description: 'Reports an expression Smart Forms ignores because of its language.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Smart Forms evaluates only text/fhirpath in a variable, calculatedExpression, ' +
        "enableWhenExpression, answerExpression, and a cqf-expression on an item's text, prefix " +
        'or answerValueSet, and runs a query only in a variable whose language is ' +
        'application/x-fhir-query. An expression with expression text in any other language FHIR ' +
        'defines at one of these locations is reported, on the Questionnaire root or an item.',
      why:
        'Smart Forms ignores such an expression without a warning, so a variable is never set, ' +
        'an answer is never calculated, a question is never disabled, answers are not computed, ' +
        'or a text is not updated. text/x-fhir-query, the FHIR R5 query code, is ignored too.',
      exampleMessage: message(
        'variable',
        'the Questionnaire root',
        'text/x-fhir-query',
        'this variable never sets %conditions',
      ),
      fix:
        'Rewrite the expression in FHIRPath with the language text/fhirpath in the FSH rule that ' +
        'sets it, then run SUSHI again. To use server data, fetch it in an ' +
        'application/x-fhir-query variable on the item or an ancestor and reference that ' +
        'variable. For a query in a variable, set the language to application/x-fhir-query.',
      limitations:
        'Not reported: an expression next to a text/fhirpath one with the same URL on the same ' +
        'element, which Smart Forms uses instead; a variable with no name, or with another ' +
        'variable of its name on the same element that Smart Forms accepts; a language SDC does ' +
        'not allow at the location, or one outside the six codes FHIR defines, which core ' +
        'reports. Uncatalogued Smart Forms extensions, reference-only Expressions and the root ' +
        "title's cqf-expression are not checked. The facts behind this rule come " +
        'from the Smart Forms source and are not yet reproduced against the renderer.',
    },
  },
  check(ctx) {
    // Crashes on an older core even when the form has no site to check.
    requireCompat(ctx);
    for (const site of ctx.sites) {
      if (!isLanguageSite(site) || coreReportsLanguage(site)) continue;
      // Population evaluates it as FHIRPath: expression-evaluated-as-fhirpath reports it.
      if (site.location.url === INITIAL_EXPRESSION) continue;
      if (!readBy(ctx, site).some(({ handling }) => ignores(handling, site.language))) continue;
      if (filtering.includes(site.location.url) && hasFhirPathAlternative(ctx.document, site)) {
        continue;
      }
      if (
        site.location.url === VARIABLE &&
        (site.name === undefined || site.name === '' || hasAcceptedNamesake(ctx.document, site))
      ) {
        continue;
      }
      ctx.report({
        site,
        message: message(
          extensionName(site),
          elementName(ctx.document, site.item),
          site.language,
          consequence(site),
        ),
        help:
          site.location.url === VARIABLE && site.language === 'text/x-fhir-query'
            ? queryCodeHelp
            : rewriteHelp,
      });
    }
  },
};
