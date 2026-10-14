import type { AvailableVariables } from './available-variables.js';
import type { Declaration } from './declarations.js';
import type { ExpressionSite } from './expression-site.js';
import { hasFhirPathText, type VariableReference } from './fhirpath.js';
import { hasQueryText, scanQueryFragments } from './x-fhir-query.js';

// Dependencies is public: plugin rules receive it from RuleContext's dependenciesOf (API stage C).
// findDependencies stays internal.

// What a declaration's expression references.
export interface Dependencies {
  // The declarations its %name references resolve to at their sites (D13, D19), each once, in the
  // order of their first reference. Its own name resolves outward first (D25). A launchContext or an extractAllocateId has none.
  readonly on: readonly Declaration[];
  // Whether its references were found: its expression is FHIRPath that parses, or an x-fhir-query
  // whose fragments are all closed and parse. A launchContext or an extractAllocateId has no
  // expression, so nothing is missing.
  readonly analysed: boolean;
  // Whether on is every declaration it references: it was analysed, and no reference follows a
  // defineVariable with a computed name, which may bind it.
  readonly known: boolean;
}

// The FHIRPath sites of a declaration's expression: the site itself, or the fragments of a query,
// which directly follow it. Undefined when its references cannot be found.
function referencingSites(
  site: ExpressionSite,
  sites: readonly ExpressionSite[],
): readonly ExpressionSite[] | undefined {
  if (hasFhirPathText(site)) return [site];
  if (!hasQueryText(site) || scanQueryFragments(site.text).unclosedAt !== undefined) {
    return undefined;
  }
  return sites.filter(
    (each) => each.carrier === 'fragment' && each.expressionPointer === site.expressionPointer,
  );
}

const unanalysed: Dependencies = Object.freeze({
  on: Object.freeze([]),
  analysed: false,
  known: false,
});

// The dependencies of each declaration of a document. A reference that follows a defineVariable
// with a computed name is left out, so a cycle is never reported through it.
export function findDependencies(
  declarations: readonly Declaration[],
  sites: readonly ExpressionSite[],
  references: ReadonlyMap<ExpressionSite, readonly VariableReference[]>,
  variablesAt: (site: ExpressionSite) => AvailableVariables | undefined,
): ReadonlyMap<Declaration, Dependencies> {
  const dependencies = new Map<Declaration, Dependencies>();
  for (const declaration of declarations) {
    const { site } = declaration;
    const from = site === undefined ? [] : referencingSites(site, sites);
    if (from === undefined) {
      dependencies.set(declaration, unanalysed);
      continue;
    }
    const on = new Set<Declaration>();
    let analysed = true;
    let known = true;
    for (const each of from) {
      const found = references.get(each);
      const available = variablesAt(each);
      if (found === undefined || available === undefined) {
        analysed = false;
        continue;
      }
      for (const { name, complete } of found) {
        if (!complete) {
          known = false;
          continue;
        }
        const target = available.resolve(name)?.declaration;
        if (target !== undefined) on.add(target);
      }
    }
    dependencies.set(
      declaration,
      Object.freeze({ on: Object.freeze([...on]), analysed, known: analysed && known }),
    );
  }
  return dependencies;
}
