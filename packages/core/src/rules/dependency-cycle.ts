import type { Declaration } from '../analysis/declarations.js';
import type { Dependencies } from '../analysis/dependencies.js';
import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type { ExpressionSite } from '../analysis/expression-site.js';
import type { CoreRule } from '../plugins/core-rule.js';
import { placeOf } from './describe.js';

type Graph = ReadonlyMap<Declaration, Dependencies>;

const dependenciesOf = (graph: Graph, declaration: Declaration): readonly Declaration[] =>
  graph.get(declaration)?.on ?? [];

// The strongly connected components of the graph that hold a cycle: more than one declaration, or
// one that references itself. Each lists its declarations in document order, and the components
// are in the order of their first declarations (Tarjan's algorithm).
function cyclicComponents(declarations: readonly Declaration[], graph: Graph): Declaration[][] {
  const order = new Map(declarations.map((declaration, index) => [declaration, index]));
  const visited = new Map<Declaration, { index: number; low: number }>();
  const stack: Declaration[] = [];
  const onStack = new Set<Declaration>();
  const components: Declaration[][] = [];

  const visit = (declaration: Declaration): { index: number; low: number } => {
    const state = { index: visited.size, low: visited.size };
    visited.set(declaration, state);
    stack.push(declaration);
    onStack.add(declaration);
    for (const target of dependenciesOf(graph, declaration)) {
      const seen = visited.get(target);
      if (seen === undefined) state.low = Math.min(state.low, visit(target).low);
      else if (onStack.has(target)) state.low = Math.min(state.low, seen.index);
    }
    if (state.low === state.index) {
      const component: Declaration[] = [];
      let member: Declaration | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== declaration);
      components.push(component);
    }
    return state;
  };
  for (const declaration of declarations) {
    if (!visited.has(declaration)) visit(declaration);
  }

  const position = (declaration: Declaration | undefined): number =>
    declaration === undefined ? -1 : (order.get(declaration) ?? -1);
  return components
    .filter(
      ([first, ...rest]) =>
        rest.length > 0 || (first !== undefined && dependenciesOf(graph, first).includes(first)),
    )
    .map((component) => component.sort((a, b) => position(a) - position(b)))
    .sort(([a], [b]) => position(a) - position(b));
}

// Whether no declaration the given one reaches, itself included, has a reference that may be bound
// locally, so that no edge of a cycle through it can be missing. A declaration whose expression
// was not analysed, because it does not parse or is in another language, is not followed.
function reachesOnlyKnown(declaration: Declaration, graph: Graph): boolean {
  const seen = new Set([declaration]);
  const queue = [declaration];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const dependencies = graph.get(next);
    if (dependencies?.analysed === true && !dependencies.known) return false;
    for (const target of dependenciesOf(graph, next)) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return true;
}

const declarationAt = (
  site: ExpressionSite,
  analysis: DocumentAnalysis,
): Declaration | undefined =>
  site.declares
    ? analysis.declarations.find((declaration) => declaration.site === site)
    : undefined;

// Whether the rule completes its check at a site: it reports only at declarations, and completes at
// one whose dependencies, and those of every declaration it reaches, are known.
export function completesCycleCheck(site: ExpressionSite, analysis: DocumentAnalysis): boolean {
  const declaration = declarationAt(site, analysis);
  return declaration === undefined || reachesOnlyKnown(declaration, analysis.dependencies);
}

// Whether the rule applies at a site but cannot complete there. A declaration whose expression does
// not parse, or is in another language, is not one: the rule does not apply to it.
export function leavesCycleCheckIncomplete(
  site: ExpressionSite,
  analysis: DocumentAnalysis,
): boolean {
  const declaration = declarationAt(site, analysis);
  return (
    declaration !== undefined &&
    analysis.dependencies.get(declaration)?.analysed === true &&
    !reachesOnlyKnown(declaration, analysis.dependencies)
  );
}

// %a, %b and %c.
function nameList(names: readonly string[]): string {
  const written = names.map((name) => `%${name}`);
  const last = written.pop() ?? '';
  return written.length === 0 ? last : `${written.join(', ')} and ${last}`;
}

const message = (names: readonly string[]): string =>
  names.length === 1
    ? `Declaration ${nameList(names)} references itself; updates may not reach a stable value.`
    : `Declarations ${nameList(names)} reference each other; updates may not reach a stable ` +
      'value.';

const help =
  'Break the dependency cycle or verify that these expressions reach stable values in the form ' +
  'filler.';

export const dependencyCycle: CoreRule = {
  meta: {
    description: 'Reports declarations whose expressions reference each other in a cycle.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        'Follows each %name in the expression of a declaration, such as a variable or a named ' +
        'calculatedExpression, and in the {{…}} fragments of its query, to the declaration it ' +
        'resolves to on its item, an ancestor item or the root. Declarations that reach each ' +
        'other through these references form a cycle, directly or through others; a declaration ' +
        'that references itself is one too. Each cycle is reported once, at its first ' +
        'declaration, with the others as related locations.',
      why:
        'A form filler recomputes a declaration when a declaration it references changes. In a ' +
        'cycle, each update can trigger another, and the values may never settle, or may stay ' +
        'empty. A cycle can also be deliberate and reach stable values, so it is a warning, not ' +
        'an error.',
      exampleMessage: message(['a', 'b']),
      fix:
        'Change the expressions so that one of the declarations no longer references the ' +
        'others, then run SUSHI again. If the cycle is deliberate, check in the form filler ' +
        'that its values settle, and suppress the finding.',
      limitations:
        'The rule finds references in the text; it does not evaluate expressions, so a ' +
        'reference in a branch that is never taken still counts. Expressions that do not ' +
        'parse, in other languages, in contained resources or at uncatalogued locations are not ' +
        'followed. A reference after a defineVariable whose name is computed is not followed, ' +
        'and a cycle through it is not reported.',
    },
  },
  check(ctx, { declarations, dependencies }) {
    for (const [first, ...others] of cyclicComponents(declarations, dependencies)) {
      // A declaration in a cycle references something, so it is an Expression.
      if (first?.site === undefined) continue;
      ctx.report({
        site: first.site,
        message: message([first, ...others].map(({ name }) => name)),
        help,
        ...(others.length === 0
          ? {}
          : {
              relatedLocations: others.map((other) => ({
                ...placeOf(other),
                message: `%${other.name} is declared here`,
              })),
            }),
      });
    }
  },
};
