import type { ExpressionSite, RuleContext } from 'sdc-questionnaire-lint';
import { type LanguageHandling, languageFactAt } from './facts/languages.js';
import { prerequisitesHold } from './facts/prerequisites.js';
import { type Component, components } from './facts/versions.js';
import { FHIRPATH, X_FHIR_QUERY } from './urls.js';

// A selected component that reads a site, and how it handles the site's language.
export interface Reader {
  readonly component: Component;
  readonly handling: LanguageHandling;
}

// The versions of the components the run checks against, which each rule reads first. Core
// guarantees a version for every component in compat.required, which lists every component here,
// so a conforming core never makes this throw. The throw narrows the type, and fails a direct
// caller of check that passes no version rather than check nothing.
export function requireCompat(ctx: Pick<RuleContext, 'compat'>): Record<Component, string> {
  // Typed as always present; read defensively for a direct caller of check.
  const compat = ctx.compat as Readonly<Record<string, string>> | undefined;
  const versions = {} as Record<Component, string>;
  for (const component of components) {
    const version = compat?.[component];
    if (version === undefined) {
      throw new Error(
        `ctx.compat names no Smart Forms ${component} version; this plugin needs sdc-questionnaire-lint 0.1.0 or later`,
      );
    }
    versions[component] = version;
  }
  return versions;
}

// The selected template-extract version, or undefined when compat does not select it: template
// extraction is checked only when selected (S3). Read defensively, like requireCompat.
export function templateExtractVersion(ctx: Pick<RuleContext, 'compat'>): string | undefined {
  const compat = ctx.compat as Readonly<Record<string, string>> | undefined;
  return compat?.['template-extract'];
}

// The selected components that read a site, whatever its language: those with a language fact for
// its location whose prerequisites hold there. None for an uncatalogued site, a fragment site or a
// location nothing reads, such as candidateExpression, contextExpression, itemExtractionContext,
// the root _title cqf-expression or a root itemPopulationContext.
// It answers per component: the renderer reads the first text/fhirpath initialExpression to
// repopulate a form, so it can read an initialExpression population does not.
export function readBy(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  site: ExpressionSite,
): readonly Reader[] {
  const versions = requireCompat(ctx);
  if (site.carrier !== 'expression' || !site.catalogued) return [];
  return components.flatMap((component) => {
    const fact = languageFactAt(component, versions[component], site);
    return fact !== undefined &&
      prerequisitesHold(component, versions[component], ctx.document, site)
      ? [{ component, handling: fact.handling }]
      : [];
  });
}

// Whether a component that handles a variable's language so stores its name.
const binds = (handling: LanguageHandling, language: string | undefined): boolean =>
  handling === 'any-as-fhirpath' ||
  language === FHIRPATH ||
  (handling === 'fhirpath-or-query' && language === X_FHIR_QUERY);

// Whether a component stores a value under a variable's name: it evaluates the variable, and reads
// its site in a language it stores a name for (docs/smart-forms-rules.md, P5 Stored names).
export function storesVariable(
  ctx: Pick<RuleContext, 'document' | 'compat'>,
  site: ExpressionSite,
  component: Component,
): boolean {
  // The renderer sets an application/x-fhir-query variable's name to [] even without text, such
  // as one with only a reference; a FHIRPath variable without text is never evaluated.
  const evaluated = (site.text !== undefined && site.text !== '') || site.language === X_FHIR_QUERY;
  return (
    evaluated &&
    readBy(ctx, site).some(
      (reader) => reader.component === component && binds(reader.handling, site.language),
    )
  );
}
