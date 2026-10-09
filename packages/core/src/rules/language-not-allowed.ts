import type { ExpressionSite } from '../analysis/expression-site.js';
import { languagesAllowedAt } from '../analysis/extension-catalog.js';
import { X_FHIR_QUERY } from '../analysis/x-fhir-query.js';
import type { LintRule } from '../plugins/contract.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

// Languages the FHIR Validator already rejects at a location, so this rule leaves them to it
// (D3): sdc-inv1 rejects only the R4 query code on enableWhenExpression.
const rejectedByValidator: Readonly<Record<string, readonly string[]>> = {
  [`${sdc}enableWhenExpression`]: [X_FHIR_QUERY],
};

// Where the rule checks: every Expression with a language at a catalogued location.
export function hasCataloguedLanguage(
  site: ExpressionSite,
): site is ExpressionSite & { language: string } {
  return site.carrier === 'expression' && site.language !== undefined && site.catalogued;
}

const message = (extension: string, language: string): string =>
  `This ${extension} is written in ${language}, but SDC allows only FHIRPath or CQL here, so ` +
  'the form may ignore it.';

// Never suggests the R4 query code: it is not allowed where the R5 one is not.
const help =
  'rewrite the expression in FHIRPath, with the language text/fhirpath, or in CQL, with text/cql';

export const languageNotAllowed: LintRule = {
  meta: {
    description: 'Reports an expression language that SDC does not allow at its location.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'SDC allows only FHIRPath or CQL in an enableWhenExpression and in the expression of an ' +
        'answerOptionsToggleExpression. Any other language there is reported, including either ' +
        'x-fhir-query code, except application/x-fhir-query on an enableWhenExpression, which the ' +
        'FHIR Validator already rejects. Other locations allow any language.',
      why:
        'An enableWhenExpression or an answerOptionsToggleExpression must evaluate to true or ' +
        'false while the form is filled in. A form filler need not evaluate a query or another ' +
        'language there, so the question is not enabled or its options are not toggled as the ' +
        'author intended.',
      exampleMessage: message('enableWhenExpression', 'text/x-fhir-query'),
      fix:
        'Write the condition in FHIRPath and set the language to text/fhirpath in the FSH rule ' +
        'that sets the expression, then run SUSHI again. If it needs data from a server, fetch ' +
        'it in a variable on the item or an ancestor and reference that variable.',
      limitations:
        'Only the restrictions in the SDC expressions table are checked. The CQL codes ' +
        'text/cql-identifier and text/cql-expression are accepted wherever text/cql is. Run the ' +
        'FHIR Validator for the restrictions it enforces. Uncatalogued expressions are not ' +
        'checked.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      if (!hasCataloguedLanguage(site) || site.location === undefined) continue;
      const { language, location } = site;
      const allowed = languagesAllowedAt(location);
      if (allowed === undefined || allowed.includes(language)) continue;
      if (rejectedByValidator[location.url]?.includes(language)) continue;
      // Both restricted locations are SDC extensions, so the name follows the SDC prefix.
      ctx.report({ site, message: message(location.url.slice(sdc.length), language), help });
    }
  },
};
