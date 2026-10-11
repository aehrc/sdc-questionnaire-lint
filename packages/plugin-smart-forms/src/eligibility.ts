import type { ExpressionSite, RuleContext } from 'sdc-questionnaire-lint';
import { type LanguageHandling, languageFactAt } from './facts/languages.js';
import { prerequisitesHold } from './facts/prerequisites.js';
import { type Component, components } from './facts/versions.js';

// A selected component that reads a site, and how it handles the site's language.
export interface Reader {
  readonly component: Component;
  readonly handling: LanguageHandling;
}

// The versions of the components the run checks against. An older core passes no ctx.compat; the
// rule then crashes with RULE_CRASH rather than check nothing, so each rule calls this first.
export function requireCompat(ctx: Pick<RuleContext, 'compat'>): Record<Component, string> {
  // Typed as always present, but absent in a core older than 0.1.0.
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
