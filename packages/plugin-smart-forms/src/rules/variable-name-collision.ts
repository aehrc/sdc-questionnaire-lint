import {
  type Declaration,
  definerOf,
  type LintRule,
  type QuestionnaireDocument,
  type RuleContext,
  type RuleRelatedLocation,
  type SiteItem,
} from 'sdc-questionnaire-lint';
import { elementName, isObject, resolve } from '../document.js';
import { readBy, requireCompat } from '../eligibility.js';
import type { LanguageHandling } from '../facts/languages.js';
import { populationReadsContext } from '../facts/prerequisites.js';
import { variableFactsAt } from '../facts/variables.js';
import { components } from '../facts/versions.js';
import { suppliedSourceQueries } from '../host-variables.js';
import { FHIRPATH, X_FHIR_QUERY } from '../urls.js';

// A name Smart Forms stores a value under, and where a finding about it is reported.
interface StoredName {
  readonly name: string;
  readonly declaration: Declaration;
}

// The name a launchContext stores its resource under in population: its first sub-extension's
// valueId, else its valueCoding.code, when it has a name sub-extension with either and a type
// sub-extension with a valueCode, and its second sub-extension has a valueCode, the resource type
// population reads (inputParameters.ts:97-121,338-374). Not Declaration.name, which core finds by
// URL and reads valueCoding.code first.
function launchContextName(
  document: QuestionnaireDocument,
  declaration: Declaration,
): string | undefined {
  const extension = resolve(document, declaration.pointer);
  const parts: readonly unknown[] =
    isObject(extension) && Array.isArray(extension.extension) ? extension.extension : [];
  const hasPart = (url: string, valid: (part: Readonly<Record<string, unknown>>) => unknown) =>
    parts.some((part) => isObject(part) && part.url === url && Boolean(valid(part)));
  const named = hasPart(
    'name',
    (part) => part.valueId || (isObject(part.valueCoding) && part.valueCoding.code),
  );
  const typed = hasPart('type', (part) => part.valueCode);
  const [first, second] = parts;
  const name = isObject(first)
    ? (first.valueId ?? (isObject(first.valueCoding) ? first.valueCoding.code : undefined))
    : undefined;
  const resourceType = isObject(second) ? second.valueCode : undefined;
  return named && typed && Boolean(resourceType) && typeof name === 'string' && name !== ''
    ? name
    : undefined;
}

// Whether a component that handles a variable's language so stores its name.
const binds = (handling: LanguageHandling, language: string | undefined): boolean =>
  handling === 'any-as-fhirpath' ||
  language === FHIRPATH ||
  (handling === 'fhirpath-or-query' && language === X_FHIR_QUERY);

// The name a declaration stores under in a selected component, or undefined when it stores none:
// a variable in a language the component runs, an itemPopulationContext population reads, and a
// launchContext under the name population reads.
function storedName(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  versions: ReturnType<typeof requireCompat>,
  declaration: Declaration,
): string | undefined {
  const { kind, site } = declaration;
  if (kind === 'launchContext') {
    return variableFactsAt('populate', versions.populate).has('launch-context-named-by-position')
      ? launchContextName(ctx.document, declaration)
      : undefined;
  }
  if (site === undefined) return undefined;
  if (kind === 'variable') {
    // The renderer sets an application/x-fhir-query variable's name to [] even without text, such
    // as one with only a reference; a FHIRPath variable without text is never evaluated.
    const evaluated =
      (site.text !== undefined && site.text !== '') || site.language === X_FHIR_QUERY;
    return evaluated && readBy(ctx, site).some(({ handling }) => binds(handling, site.language))
      ? declaration.name
      : undefined;
  }
  if (kind === 'itemPopulationContext') {
    return variableFactsAt('populate', versions.populate).has(
      'population-context-stored-by-name',
    ) && populationReadsContext(ctx.document, site)
      ? declaration.name
      : undefined;
  }
  return undefined;
}

const keyOf = (item: SiteItem | undefined): string => item?.pointer ?? '';

const where = ({ declaration }: StoredName): Pick<RuleRelatedLocation, 'site' | 'pointer'> =>
  declaration.site === undefined ? { pointer: declaration.pointer } : { site: declaration.site };

const consequence =
  'Smart Forms keeps one value for each name, so expressions on either element can get the ' +
  "other's value.";

const message = (name: string, element: string): string =>
  `%${name} is also declared on ${element}; ${consequence}`;

const sourceQueryMessage = (name: string): string =>
  `%${name} is also the name of a sourceQueries result; Smart Forms keeps one value for each ` +
  "name, so expressions that read either can get the other's value.";

export const variableNameCollision: LintRule = {
  meta: {
    description:
      'Reports a name declared on two elements, or named like a sourceQueries result, which ' +
      'Smart Forms stores as one value.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'The names Smart Forms stores a value under: variables in text/fhirpath or ' +
        'application/x-fhir-query on the root and on items, the itemPopulationContexts ' +
        'population reads, root launchContexts under the name population reads, and the ' +
        'sourceQueries results population binds. It reports each such name that is also ' +
        'declared on another element, the ancestors and descendants of an item included, and ' +
        'each declaration named like a sourceQueries result.',
      why:
        'SDC makes a variable available only on its element and below, the innermost ' +
        'declaration of a name winning. Smart Forms keeps one value for each name for the whole ' +
        'form, so a declaration on one element replaces the value of a declaration of the same ' +
        'name on another, and expressions on either element can get the wrong value. Which one ' +
        'wins depends on the order items are evaluated in, children first.',
      exampleMessage: message('score', 'item "Total" (total)'),
      fix:
        'Rename one of the declarations, in the FSH rule that sets its name, so that the name is ' +
        'declared on one element only and differs from every sourceQueries result, and update ' +
        'the expressions that reference it. Then run SUSHI again.',
      limitations:
        'Two declarations of a name on one element are left to sdc/duplicate-declaration, and a ' +
        'name FHIRPath, FHIR or SDC defines to sdc/reserved-name. sdc/shadowed-declaration also ' +
        'reports a declaration that hides one on an ancestor, at info: it states the SDC ' +
        'scoping, this rule what Smart Forms does. A launchContext written with its type first ' +
        'stores no name in population and is not checked. The rule does not say which ' +
        'declaration wins. The renderer facts come from the Smart Forms source; the population ' +
        'facts are reproduced against sdc-populate.',
    },
  },
  check(ctx) {
    const versions = requireCompat(ctx);
    if (
      !components.some((component) =>
        variableFactsAt(component, versions[component]).has('one-value-per-name'),
      )
    ) {
      return;
    }
    const { document, declarations } = ctx;

    // Each declaration's name as Smart Forms reads it, for the names declared earlier on its
    // element: a launchContext's by its Smart Forms name, when it stores one.
    const stored = new Map<Declaration, string>();
    for (const declaration of declarations) {
      const name = storedName(ctx, versions, declaration);
      if (name !== undefined) stored.set(declaration, name);
    }
    const nameOf = (declaration: Declaration): string =>
      declaration.kind === 'launchContext'
        ? (stored.get(declaration) ?? declaration.name)
        : declaration.name;

    // A stored name is a finding target unless an earlier declaration of its name, of any kind or
    // language, is on its element: sdc/duplicate-declaration reports that pair (S9).
    const targets: StoredName[] = [];
    const seen = new Set<string>();
    for (const declaration of declarations) {
      const name = stored.get(declaration);
      const key = `${keyOf(declaration.item)}\n${name ?? nameOf(declaration)}`;
      if (name !== undefined && !seen.has(key) && definerOf(name) === undefined) {
        targets.push({ name, declaration });
      }
      seen.add(key);
    }

    // The first stored name of each name, which later ones on other elements collide with.
    const first = new Map<string, StoredName>();
    for (const [declaration, name] of stored) {
      if (!first.has(name)) first.set(name, { name, declaration });
    }
    const sourceQueries = new Map<string, string>();
    for (const { name, extensionIndex } of suppliedSourceQueries(ctx)) {
      if (name !== undefined && !sourceQueries.has(name)) {
        sourceQueries.set(name, `${document.resourcePointer}/extension/${String(extensionIndex)}`);
      }
    }

    for (const target of targets) {
      const { name, declaration } = target;
      const earlier = first.get(name);
      if (earlier !== undefined && keyOf(earlier.declaration.item) !== keyOf(declaration.item)) {
        ctx.report({
          ...where(target),
          message: message(name, elementName(document, earlier.declaration.item)),
          help: 'rename one of the declarations so the name is declared on one element only',
          relatedLocations: [{ ...where(earlier), message: `%${name} is also declared here` }],
        });
      }
      const sourceQuery = sourceQueries.get(name);
      if (sourceQuery !== undefined) {
        ctx.report({
          ...where(target),
          message: sourceQueryMessage(name),
          help: 'rename the declaration',
          relatedLocations: [
            {
              pointer: sourceQuery,
              message: `%${name} is also the name of this sourceQueries result`,
            },
          ],
        });
      }
    }
  },
};
