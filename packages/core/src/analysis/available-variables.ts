import type { Declaration } from './declarations.js';
import type { ExpressionSite, ExpressionUseCase, SiteItem } from './expression-site.js';

// AvailableVariables and Variable are public: plugin rules receive them from RuleContext's
// variablesAt (API stage B). definerOf and BuiltinDefiner are public too (stage C), so a plugin rule
// can stay silent on the names sdc/reserved-name reports. builtinNames and the other functions here
// stay internal; a plugin reads a variable's origin instead.

// The specification that defines a built-in name.
export type BuiltinDefiner = 'FHIR' | 'FHIRPath' | 'SDC';

// The names FHIRPath, FHIR and SDC define, which a form must not declare (D23). All are available
// at every site, extraction sites included (D19), except %qitem, which needs an item.
// %terminologies, %factory and %server belong to FHIR's R4 and R5 APIs; a Questionnaire does not
// state its FHIR version, so they are available everywhere.
export const builtinNames: ReadonlyMap<string, BuiltinDefiner> = new Map([
  ['resource', 'FHIR'],
  ['rootResource', 'FHIR'],
  ['context', 'FHIRPath'],
  ['ucum', 'FHIRPath'],
  ['questionnaire', 'SDC'],
  ['qitem', 'SDC'],
  ['sct', 'FHIR'],
  ['loinc', 'FHIR'],
  ['terminologies', 'FHIR'],
  ['factory', 'FHIR'],
  ['server', 'FHIR'],
]);

// FHIR defines every name with these prefixes, such as %vs-conditions and %ext-birthPlace.
export const builtinPrefixes: readonly string[] = ['vs-', 'ext-'];

// The specification that defines a name, or undefined when none does: the classification
// sdc/reserved-name reports declarations by, and config hostVariables and plugin hooks are checked
// against.
export function definerOf(name: string): BuiltinDefiner | undefined {
  if (builtinPrefixes.some((prefix) => name.startsWith(prefix))) return 'FHIR';
  return builtinNames.get(name);
}

// A name an expression can reference at its site.
export interface Variable {
  readonly name: string;
  // assembled: listed by the module's assembleContext, so the including Questionnaire supplies it.
  readonly origin: 'declaration' | 'builtin' | 'assembled' | 'host';
  // Set only when origin is declaration.
  readonly declaration?: Declaration;
}

export interface AvailableVariables {
  // Each available name once: the declarations, innermost first and then in document order, then
  // the built-in names, the assembleContext names and the host variables that nothing before them
  // overrides. Names with a built-in prefix are not listed.
  readonly variables: readonly Variable[];
  // The variable a %name reference gets: the innermost declaration of the name, else a built-in
  // name, one with a built-in prefix included, else an assembleContext name, else a host variable.
  // At a declaring site, or a fragment of its query, the declaration's own name resolves as if it
  // were absent: to the declaration of the name on the nearest ancestor element, else to a name
  // that is not a declaration, and to the declaration itself only when nothing else supplies the
  // name (core-rules.md D25).
  resolve(name: string): Variable | undefined;
}

// Whether an SDC extraction feature is the only use of a site or a declaration (D19).
export function extractionOnly(useCases: readonly ExpressionUseCase[]): boolean {
  return useCases.length > 0 && useCases.every((useCase) => useCase === 'extraction');
}

// Whether a declaration is on the item, on one of its ancestors, or on the root. Compared with a
// trailing /, so that /item/1 is not an ancestor of /item/10.
function onElementOrAncestor({ item: owner }: Declaration, item: SiteItem | undefined): boolean {
  if (owner === undefined) return true;
  return (
    item !== undefined &&
    (item.pointer === owner.pointer || item.pointer.startsWith(`${owner.pointer}/`))
  );
}

// Whether a declaration can be referenced on an element under D19, before resolving shadowing
// and a declaration's own name.
export function canReferenceDeclaration(
  declaration: Declaration,
  item: SiteItem | undefined,
  extraction: boolean,
): boolean {
  return (
    onElementOrAncestor(declaration, item) &&
    (extraction ? extractionOnly(declaration.useCases) : declaration.kind !== 'allocateId')
  );
}

// An ancestor's pointer is a prefix of its descendants', so a longer pointer is further in.
const depth = ({ item }: Declaration): number => item?.pointer.length ?? -1;

// The available variables at each site of a document, from its declarations, its assembleContext
// names and the configured host variables. An uncatalogued site has none: name analysis cannot run
// there, which is not the same as an empty list.
export function availableVariables(
  declarations: readonly Declaration[],
  assembled: readonly string[],
  hostVariables: readonly string[],
): (site: ExpressionSite) => AvailableVariables | undefined {
  const cache = new Map<ExpressionSite, AvailableVariables>();

  function build(site: ExpressionSite): AvailableVariables {
    // Extraction sees only extractAllocateId names and named extraction contexts (D19); every other
    // site sees every other declaration, whatever its use cases (D13, D17).
    const extraction = extractionOnly(site.useCases);
    const reachable = declarations
      .filter((declaration) => canReferenceDeclaration(declaration, site.item, extraction))
      // Stable, so declarations on one element keep document order (D8).
      .sort((a, b) => depth(b) - depth(a));
    const byName = new Map<string, Variable>();
    // The names that are not declarations, which a declaration of the name overrides.
    const supplied = new Map<string, Variable>();
    const add = (variable: Variable, into = byName): void => {
      if (!into.has(variable.name)) into.set(variable.name, Object.freeze(variable));
    };
    for (const declaration of reachable) {
      add({ name: declaration.name, origin: 'declaration', declaration });
    }
    for (const name of builtinNames.keys()) {
      if (name !== 'qitem' || site.item !== undefined) add({ name, origin: 'builtin' }, supplied);
    }
    // Available at every site, extraction included: the including Questionnaire may supply the name
    // in a form extraction can see, such as an extractAllocateId (D24).
    for (const name of assembled) add({ name, origin: 'assembled' }, supplied);
    for (const name of hostVariables) add({ name, origin: 'host' }, supplied);
    for (const variable of supplied.values()) add(variable);
    const resolveSupplied = (name: string): Variable | undefined =>
      supplied.get(name) ??
      (builtinPrefixes.some((prefix) => name.startsWith(prefix))
        ? Object.freeze({ name, origin: 'builtin' as const })
        : undefined);
    // The declaration the site's expression belongs to, when it is the innermost of its name: a
    // fragment shares its query's Expression (D25).
    const own = reachable.find(
      (declaration) =>
        declaration.site?.expressionPointer === site.expressionPointer &&
        byName.get(declaration.name)?.declaration === declaration,
    );
    const outer =
      own === undefined
        ? undefined
        : reachable.find((other) => other.name === own.name && depth(other) < depth(own));
    const ownName =
      own === undefined
        ? undefined
        : outer === undefined
          ? resolveSupplied(own.name)
          : Object.freeze({ name: own.name, origin: 'declaration' as const, declaration: outer });
    return Object.freeze({
      variables: Object.freeze([...byName.values()]),
      resolve: (name: string) =>
        (name === own?.name ? ownName : undefined) ?? byName.get(name) ?? resolveSupplied(name),
    });
  }

  return (site) => {
    if (!site.catalogued) return undefined;
    let variables = cache.get(site);
    if (variables === undefined) {
      variables = build(site);
      cache.set(site, variables);
    }
    return variables;
  };
}
