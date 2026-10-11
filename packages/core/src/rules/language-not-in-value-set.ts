import type { ExpressionSite } from '../analysis/expression-site.js';
import { definedLanguages, languagesAllowedAt } from '../analysis/extension-catalog.js';
import type { LintRule } from '../plugins/contract.js';
import { closestName } from '../suggest.js';

// Where the rule checks: every Expression with a language, catalogued or not.
export function hasExpressionLanguage(
  site: ExpressionSite,
): site is ExpressionSite & { language: string } {
  return site.carrier === 'expression' && site.language !== undefined;
}

const message = (language: string): string =>
  `The language ${language} is not one FHIR defines, so the form may ignore this expression.`;

// The code the author most likely meant, among those the location allows: the same code in other
// case, or a close one. A query code is never suggested where queries are not allowed.
function similarLanguage(site: ExpressionSite, language: string): string | undefined {
  const allowed = site.location === undefined ? undefined : languagesAllowedAt(site.location);
  const candidates = definedLanguages.filter((code) => allowed?.includes(code) ?? true);
  return (
    candidates.find((code) => code === language.toLowerCase()) ?? closestName(language, candidates)
  );
}

export const languageNotInValueSet: LintRule = {
  meta: {
    description: 'Reports an expression language that FHIR R4 and R5 do not define.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        'The language of every Expression, at a catalogued location or found elsewhere in the ' +
        'Questionnaire, must be one of the codes FHIR R4 or R5 defines: text/fhirpath, text/cql, ' +
        'application/x-fhir-query, text/x-fhir-query, text/cql-identifier or text/cql-expression.',
      why:
        'Form fillers choose how to evaluate an expression by its language. One with a code they ' +
        'do not know, such as a misspelt text/fhirpath, is not evaluated, so a calculated value ' +
        'is never filled in or a question is never shown.',
      exampleMessage: message('text/fhir-path'),
      fix:
        'Correct the language in the FSH rule that sets the expression, then run SUSHI again. ' +
        'The help names a code with a similar spelling when there is one that the location ' +
        'allows.',
      limitations:
        'The FHIR binding is extensible, so a language outside these codes is allowed when a ' +
        'form filler the form targets supports it; suppress the finding for such an expression. ' +
        'An Expression with no language is not reported.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (!hasExpressionLanguage(site) || definedLanguages.includes(site.language)) continue;
      const similar = similarLanguage(site, site.language);
      ctx.report({
        site,
        message: message(site.language),
        ...(similar === undefined ? {} : { help: `set the language to ${similar}` }),
      });
    }
  },
};
