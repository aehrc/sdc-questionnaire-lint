import { isQueryLanguage, type LintRule } from '@aehrc/sdc-questionnaire-lint';
import { elementName } from '../document.js';
import { readBy, requireCompat } from '../eligibility.js';
import {
  ANSWER_OPTIONS_TOGGLE_EXPRESSION,
  FHIRPATH,
  INITIAL_EXPRESSION,
  ITEM_POPULATION_CONTEXT,
  TARGET_CONSTRAINT,
} from '../urls.js';
import {
  coreReportsLanguage,
  extensionName,
  isLanguageSite,
  type LanguageSite,
} from './language-sites.js';

// What goes wrong when query text is evaluated as FHIRPath, by location: it throws on ? and the
// error is caught, or it returns nothing.
const queryConsequences: Readonly<Record<string, string>> = {
  [TARGET_CONSTRAINT]: 'the constraint never reports a problem',
  [ANSWER_OPTIONS_TOGGLE_EXPRESSION]: 'its options are not toggled',
  [INITIAL_EXPRESSION]: 'the answer is not prefilled',
  [ITEM_POPULATION_CONTEXT]: 'the group is not prefilled',
};

// CQL text can be valid FHIRPath that returns a value, and the renderer treats an empty result of
// a targetConstraint containing intersect as a violation, so only the language not running is
// certain there.
function consequence(site: LanguageSite): string {
  const certain =
    isQueryLanguage(site.language) &&
    !(site.location.url === TARGET_CONSTRAINT && site.text.includes('intersect'));
  const stated = queryConsequences[site.location.url];
  return certain && stated !== undefined ? stated : `the ${site.language} is never run`;
}

const message = (
  component: string,
  extension: string,
  element: string,
  language: string,
  result: string,
): string =>
  `Smart Forms ${component} evaluates this ${extension} on ${element} as FHIRPath although it ` +
  `is written in ${language}, so ${result}.`;

const contextHelp =
  'fetch the resources in an application/x-fhir-query variable on the Questionnaire root, and ' +
  'set itemPopulationContext to FHIRPath over it, such as %name.entry.resource';
const rewriteHelp = 'rewrite it in FHIRPath with the language text/fhirpath';

export const expressionEvaluatedAsFhirpath: LintRule = {
  meta: {
    description: 'Reports an expression Smart Forms evaluates as FHIRPath whatever its language.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'The Smart Forms renderer evaluates a targetConstraint and an ' +
        'answerOptionsToggleExpression, and population evaluates an initialExpression and an ' +
        'itemPopulationContext, as FHIRPath without checking the language. An expression with ' +
        'expression text in another language FHIR defines is reported where Smart Forms reads ' +
        'it: a targetConstraint with a key, an error or warning severity and a human; a toggle ' +
        'with an option; the first initialExpression of an item that population evaluates; and ' +
        'the first itemPopulationContext of a group with child items, when it has a name.',
      why:
        'Query text throws when it is evaluated as FHIRPath and the error is caught, so a ' +
        'constraint never reports a problem, options are not toggled, an answer is not ' +
        'prefilled, or a group is not prefilled. CQL text is never run as CQL, and may silently ' +
        'give a different result as FHIRPath.',
      exampleMessage: message(
        'population',
        'itemPopulationContext',
        'item "Medications" (meds)',
        'application/x-fhir-query',
        'the group is not prefilled',
      ),
      fix:
        'Rewrite the expression in FHIRPath with the language text/fhirpath in the FSH rule that ' +
        'sets it, then run SUSHI again. For an itemPopulationContext query, fetch the resources ' +
        'in an application/x-fhir-query variable on the Questionnaire root and set the ' +
        'itemPopulationContext to FHIRPath over it, such as %name.entry.resource.',
      limitations:
        'Not reported: a language SDC does not allow at the location, such as a query in an ' +
        'answerOptionsToggleExpression, or one outside the six codes FHIR defines, which core ' +
        'reports; an expression Smart Forms never reads, such as a second initialExpression or a ' +
        'targetConstraint without a human. Uncatalogued Smart Forms extensions and ' +
        'reference-only Expressions are not checked. The ' +
        'renderer facts come from the Smart Forms source; the population facts are reproduced ' +
        'against sdc-populate.',
    },
  },
  check(ctx) {
    // Crashes on an older core even when the form has no site to check.
    requireCompat(ctx);
    for (const site of ctx.sites) {
      if (!isLanguageSite(site) || site.language === FHIRPATH || coreReportsLanguage(site))
        continue;
      const reader = readBy(ctx, site).find(({ handling }) => handling === 'any-as-fhirpath');
      if (reader === undefined) continue;
      ctx.report({
        site,
        message: message(
          reader.component === 'renderer' ? 'renderer' : 'population',
          extensionName(site),
          elementName(ctx.document, site.item),
          site.language,
          consequence(site),
        ),
        help:
          site.location.url === ITEM_POPULATION_CONTEXT && isQueryLanguage(site.language)
            ? contextHelp
            : rewriteHelp,
      });
    }
  },
};
