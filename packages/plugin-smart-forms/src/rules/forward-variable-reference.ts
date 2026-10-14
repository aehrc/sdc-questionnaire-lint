import {
  type Declaration,
  definerOf,
  type ExpressionSite,
  type LintRule,
} from 'sdc-questionnaire-lint';
import { elementName } from '../document.js';
import { readBy } from '../eligibility.js';
import { type Binding, compare, type Position, population } from '../population.js';
import { FHIRPATH, INITIAL_EXPRESSION, ITEM_POPULATION_CONTEXT } from '../urls.js';

// The kind of forward reference, which chooses its message and help.
type ForwardKind = 'same-element' | 'ancestor' | 'population-context';

const message = (variable: string, name: string, element: string, kind: ForwardKind): string =>
  kind === 'population-context'
    ? `%${variable} references the itemPopulationContext %${name} on ${element}, which Smart ` +
      `Forms evaluates only after every variable when it prefills the form, so %${variable} has ` +
      'no value while the form is prefilled.'
    : `%${variable} references %${name} on ${element}, which Smart Forms evaluates after ` +
      `%${variable} when it prefills the form, so %${variable} has no value while the form is ` +
      'prefilled.';

function help(
  variable: string,
  name: string,
  element: string,
  kind: ForwardKind,
  rootWorks: boolean,
): string {
  switch (kind) {
    case 'same-element':
      return `move %${name} before %${variable} on ${element}`;
    case 'ancestor':
      return (
        `compute the value in %${variable} itself` +
        (rootWorks ? `, or declare %${name} on the Questionnaire root` : '')
      );
    case 'population-context':
      return (
        `compute %${variable} from the itemPopulationContext's expression instead of %${name}, ` +
        `or read %${name} only in initialExpressions`
      );
  }
}

export const forwardVariableReference: LintRule = {
  meta: {
    description:
      'Reports a variable that references a variable or itemPopulationContext that Smart Forms ' +
      'evaluates after it when it prefills the form.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        'Each text/fhirpath variable that Smart Forms population evaluates, when an ' +
        'initialExpression or itemPopulationContext population reads uses it, directly or ' +
        'through other variables. It reports a reference the variable always evaluates to a ' +
        'declaration population evaluates later: a later variable on the Questionnaire root or ' +
        'on the same item, a variable on an ancestor item that comes later in the order ' +
        'population evaluates items in, or an itemPopulationContext.',
      why:
        'SDC lets a variable reference any variable declared on its element or an ancestor, in ' +
        'any order. Smart Forms population evaluates root variables in order, then item ' +
        'variables item by item, an item after its child items and integer-like linkIds first, ' +
        'then itemPopulationContexts. A reference to a name not yet evaluated fails, so the ' +
        'variable gets no value, and the initialExpressions that use it are not prefilled; ' +
        'population only adds a warning.',
      exampleMessage: message('bmi', 'weight', 'the Questionnaire root', 'same-element'),
      fix:
        'Move the referenced variable before the variable that references it, compute the ' +
        'value in the variable itself, or declare it on the Questionnaire root, in the FSH ' +
        'rules that set them. Then run SUSHI again.',
      limitations:
        'A reference that fhirpath.js may skip, in an iif branch, a coalesce argument after the ' +
        'first, or an argument evaluated once per item such as a where predicate, is not ' +
        'reported. The rule checks population only: the renderer starts without values, so its ' +
        'first evaluation of the reference fails too, and later ones read the value from the ' +
        'previous evaluation, which may be stale. When the Questionnaire root has no ' +
        'extensions, population skips item variables, and they are not checked. A reference is ' +
        'not reported when something population binds earlier supplies the name, which ' +
        'smart-forms/variable-name-collision reports; when the referenced declaration is ' +
        'declared twice on its element, reserved, part of a dependency cycle or not stored by ' +
        'population, which other rules report; or when an item involved has no linkId, a ' +
        'duplicate one or the linkId __proto__. The population facts are reproduced against sdc-populate.',
    },
  },
  check(ctx) {
    const pop = population(ctx);
    if (!pop.runs) return;
    const { document, declarations } = ctx;
    // When population evaluates a declaration; 'never' when it stores no name for it.
    const positionOf = (declaration: Declaration): Binding['at'] =>
      pop.bindingOf(declaration)?.at ?? 'never';

    // How many declarations each name has on each element, of any kind.
    const placeOf = ({ item }: Declaration): string => item?.pointer ?? '';
    const nameKey = (declaration: Declaration): string =>
      `${placeOf(declaration)}\n${declaration.name}`;
    const counts = new Map<string, number>();
    for (const declaration of declarations) {
      counts.set(nameKey(declaration), (counts.get(nameKey(declaration)) ?? 0) + 1);
    }

    // Whether from depends on to through the declarations its expression references, at any
    // depth, so that a reference from to to from closes a cycle.
    const dependsOn = (from: Declaration, to: Declaration): boolean => {
      const seen = new Set<Declaration>();
      const pending = [from];
      for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if (next === to) return true;
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(...(ctx.dependenciesOf(next)?.on ?? []));
      }
      return false;
    };

    const declarationAt = (site: ExpressionSite, name: string): Declaration | undefined => {
      const variable = ctx.variablesAt(site)?.resolve(name);
      return variable?.origin === 'declaration' ? variable.declaration : undefined;
    };

    // The population consumers, in document order: the initialExpressions and
    // itemPopulationContexts population reads, each with the variables it uses, directly or
    // through text/fhirpath variables population evaluates. A reference counts wherever it is,
    // since the consumer uses the value whenever it evaluates it.
    const consumers = ctx.sites.flatMap((site) => {
      const url = site.location?.url;
      if (url !== INITIAL_EXPRESSION && url !== ITEM_POPULATION_CONTEXT) return [];
      if (!readBy(ctx, site).some(({ component }) => component === 'populate')) return [];
      const used = new Set<Declaration>();
      const pending = (ctx.referencesAt(site) ?? []).flatMap(({ name, complete }) => {
        const declaration = complete ? declarationAt(site, name) : undefined;
        return declaration === undefined ? [] : [declaration];
      });
      for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if (used.has(next)) continue;
        used.add(next);
        if (
          next.kind === 'variable' &&
          next.site?.language === FHIRPATH &&
          positionOf(next) !== 'never'
        ) {
          pending.push(...(ctx.dependenciesOf(next)?.on ?? []));
        }
      }
      return [{ site, used }];
    });

    // Whether a reference from variable, evaluated at, to declaration under name is one the rule
    // stays silent about, because the reference does not fail or another rule reports its root
    // cause (S9). Each condition is checked here, whatever those rules' settings.
    const silent = (
      variable: Declaration,
      at: Position,
      declaration: Declaration,
      name: string,
    ): boolean => {
      // fhirpath.js looks names up with in, so an Object property name never fails.
      if (name in Object.prototype) return true;
      // sdc/duplicate-declaration.
      if ((counts.get(nameKey(declaration)) ?? 0) > 1) return true;
      // sdc/reserved-name.
      if (definerOf(name) !== undefined) return true;
      // sdc/dependency-cycle, a self-reference included.
      if (dependsOn(declaration, variable)) return true;
      // Something population evaluates earlier binds the name, and the reference reads its value;
      // smart-forms/variable-name-collision reports the pair. One on an item whose linkId makes
      // the order unreliable may be earlier.
      return pop
        .bindersOf(name)
        .some(
          (binder) =>
            binder.kind === 'sourceQuery' ||
            (binder.declaration !== declaration &&
              (binder.at === 'unknown' || (binder.at !== 'never' && compare(binder.at, at) < 0))),
        );
    };

    for (const variable of declarations) {
      const { kind, site } = variable;
      if (kind !== 'variable' || site === undefined || site.language !== FHIRPATH) continue;
      const at = positionOf(variable);
      if (at === 'never' || at === 'unknown') continue;
      const references = ctx.referencesAt(site);
      if (references === undefined) continue;
      const consumer = consumers.find(({ used }) => used.has(variable));
      if (consumer === undefined) continue;
      // One finding per declaration, at its first eligible reference (decision N).
      const reported = new Set<Declaration>();
      for (const { name, startOffset, endOffset, complete, conditional } of references) {
        if (!complete || conditional) continue;
        const declaration = declarationAt(site, name);
        if (declaration?.site === undefined || reported.has(declaration)) continue;
        const position = positionOf(declaration);
        if (position === 'never' || position === 'unknown' || compare(position, at) <= 0) continue;
        if (silent(variable, at, declaration, name)) continue;
        reported.add(declaration);
        const forward: ForwardKind =
          declaration.kind === 'itemPopulationContext'
            ? 'population-context'
            : placeOf(declaration) === placeOf(variable)
              ? 'same-element'
              : 'ancestor';
        const element = elementName(document, declaration.item);
        ctx.report({
          site,
          range: { startOffset, endOffset },
          message: message(variable.name, name, element, forward),
          help: help(
            variable.name,
            name,
            element,
            forward,
            ctx.readsInput(declaration.site) === false,
          ),
          relatedLocations: [
            { site: declaration.site, message: `%${name} is declared here` },
            { site: consumer.site, message: `this prefill expression uses %${variable.name}` },
          ],
        });
      }
    }
  },
};
