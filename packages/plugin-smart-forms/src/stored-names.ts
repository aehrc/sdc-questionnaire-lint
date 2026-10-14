import type { Declaration, QuestionnaireDocument, RuleContext } from 'sdc-questionnaire-lint';
import { readBy, type requireCompat } from './eligibility.js';
import type { LanguageHandling } from './facts/languages.js';
import { populationReadsContext } from './facts/prerequisites.js';
import { variableFactsAt } from './facts/variables.js';
import { type Component, components } from './facts/versions.js';
import { launchContextsOf } from './launch-contexts.js';
import { FHIRPATH, X_FHIR_QUERY } from './urls.js';

// The names Smart Forms stores a value under, which is the only way it makes a declaration
// available to other expressions (docs/smart-forms-rules.md, P5 Stored names and P6 Available
// names). Each component stores its own set: population skips item FHIRPath variables when the
// root has no extensions, and the renderer does not.

// Whether a component that handles a variable's language so stores its name.
const binds = (handling: LanguageHandling, language: string | undefined): boolean =>
  handling === 'any-as-fhirpath' ||
  language === FHIRPATH ||
  (handling === 'fhirpath-or-query' && language === X_FHIR_QUERY);

function rootHasExtensions(document: QuestionnaireDocument): boolean {
  const { extension } = document.resource;
  return Array.isArray(extension) && extension.length > 0;
}

// The name a declaration stores a value under in one component, or undefined when it stores none:
// a variable in a language the component runs, an itemPopulationContext population reads, and a
// root launchContext under the name population binds it under, read from the root extension array,
// so not one core declares in the root modifierExtension. No other named expression stores a name.
function storedNameIn(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  versions: ReturnType<typeof requireCompat>,
  declaration: Declaration,
  component: Component,
): string | undefined {
  const { kind, site } = declaration;
  const facts = variableFactsAt(component, versions[component]);
  if (kind === 'launchContext') {
    return facts.has('launch-context-named-by-position')
      ? launchContextsOf(ctx.document).find(({ pointer }) => pointer === declaration.pointer)
          ?.boundName
      : undefined;
  }
  if (site === undefined) return undefined;
  if (kind === 'variable') {
    // The renderer sets an application/x-fhir-query variable's name to [] even without text, such
    // as one with only a reference; a FHIRPath variable without text is never evaluated.
    const evaluated =
      (site.text !== undefined && site.text !== '') || site.language === X_FHIR_QUERY;
    const skipped =
      facts.has('item-fhirpath-variable-needs-root-extensions') &&
      declaration.item !== undefined &&
      site.language === FHIRPATH &&
      !rootHasExtensions(ctx.document);
    return evaluated &&
      !skipped &&
      readBy(ctx, site).some(
        (reader) => reader.component === component && binds(reader.handling, site.language),
      )
      ? declaration.name
      : undefined;
  }
  if (kind === 'itemPopulationContext') {
    return facts.has('population-context-stored-by-name') &&
      populationReadsContext(ctx.document, site)
      ? declaration.name
      : undefined;
  }
  return undefined;
}

// The name a declaration stores a value under in any of the given components, by default every
// selected one, or undefined when none of them stores one.
export function storedName(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  versions: ReturnType<typeof requireCompat>,
  declaration: Declaration,
  among: readonly Component[] = components,
): string | undefined {
  for (const component of among) {
    const name = storedNameIn(ctx, versions, declaration, component);
    if (name !== undefined) return name;
  }
  return undefined;
}
