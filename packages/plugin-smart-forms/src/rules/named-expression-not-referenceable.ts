import {
  type Declaration,
  definerOf,
  type ExpressionSite,
  type LintRule,
  type QuestionnaireDocument,
  type RuleRelatedLocation,
  type Variable,
  type VariableReference,
} from '@aehrc/sdc-questionnaire-lint';
import { elementName, isObject } from '../document.js';
import { readBy, requireCompat } from '../eligibility.js';
import {
  populationReadsContext,
  prerequisitesHold,
  type UnreadReason,
} from '../facts/prerequisites.js';
import { variableFactsAt } from '../facts/variables.js';
import { type Component, components } from '../facts/versions.js';
import { launchContextsOf } from '../launch-contexts.js';
import { population } from '../population.js';
import { storedName } from '../stored-names.js';
import { ANSWER_EXPRESSION, VARIABLE, X_FHIR_QUERY } from '../urls.js';
import { extensionName, isLocatedSite, type LocatedSite } from './language-sites.js';

// The renderer's pattern for a ValueSet URL in an application/x-fhir-query variable: only such a
// variable gets a result, the expanded ValueSet, that an answerExpression can read
// (utils/valueSet.ts:39-40,184-195).
const valueSetUrl =
  /https?:\/\/(www\.)?[-\w@:%.+~#=]{2,256}\.[a-z]{2,4}\b([-@\w:%+.~#?&/=]*ValueSet[-@\w:%+.~#?&/=]*)/;

// The name an answerExpression starts with, as the renderer computes it: the text between the first
// % and the first ., with String.substring, so it names nothing without a . after the first %
// (hooks/useValueSetCodings.ts:69-72).
const headOf = (text: string): string => text.substring(text.indexOf('%') + 1, text.indexOf('.'));

// The names of the application/x-fhir-query variables the renderer gives a result, the expanded
// ValueSet. It collects them by name in an object, root variables first and then each item's after
// its child items', a later one of a name replacing the expression of an earlier one; it then maps
// each expression that matches its ValueSet URL pattern to a name, in the object's key order, so of
// two variables with one URL only the later one gets the result
// (utils/questionnaireStoreUtils/extractVariables.ts:22-38, extractOtherExtensions.ts:190-201,
// 318-329; utils/valueSet.ts:184-195; utils/questionnaireStoreUtils/resolveValueSets.ts:37-66).
function valueSetVariables(document: QuestionnaireDocument): ReadonlySet<string> {
  const byName: Record<string, unknown> = {};
  const collect = (extensions: unknown): void => {
    for (const extension of Array.isArray(extensions) ? (extensions as unknown[]) : []) {
      if (!isObject(extension) || extension.url !== VARIABLE) continue;
      const { valueExpression: expression } = extension;
      if (
        isObject(expression) &&
        expression.language === X_FHIR_QUERY &&
        typeof expression.name === 'string' &&
        expression.name !== ''
      ) {
        byName[expression.name] = expression.expression;
      }
    }
  };
  const visit = (items: unknown): void => {
    for (const item of Array.isArray(items) ? (items as unknown[]) : []) {
      if (!isObject(item)) continue;
      visit(item.item);
      collect(item.extension);
    }
  };
  collect(document.resource.extension);
  visit(document.resource.item);
  const byUrl: Record<string, string> = {};
  for (const [name, expression] of Object.entries(byName)) {
    if (typeof expression === 'string' && expression !== '' && valueSetUrl.test(expression)) {
      byUrl[expression] = name;
    }
  }
  return new Set(Object.values(byUrl));
}

const keyOf = ({ item }: Declaration): string => item?.pointer ?? '';

const where = (declaration: Declaration): Pick<RuleRelatedLocation, 'site' | 'pointer'> =>
  declaration.site === undefined ? { pointer: declaration.pointer } : { site: declaration.site };

// Why population does not read an itemPopulationContext, as the message gives it (P6, reproduced).
const unreadReasons: Readonly<Record<UnreadReason, string>> = {
  'on-root': ', because it is on the Questionnaire root',
  'no-child-items': ', because the item has no child items',
  'not-first': ', because another itemPopulationContext comes first on the item',
  'no-name': ', because it has no name',
  'no-text': ', because it has no expression text',
};

const unavailable = (name: string, extension: string, element: string, reason: string): string =>
  `%${name} refers to the ${extension} on ${element}, which Smart Forms does not make available ` +
  `to other expressions${reason}`;

const message = (name: string, extension: string, element: string, reason: string): string =>
  `${unavailable(name, extension, element, reason)}, so the reference never gets its value.`;

const otherValueMessage = (
  name: string,
  extension: string,
  element: string,
  reason: string,
): string =>
  `${unavailable(name, extension, element, reason)}; Smart Forms keeps one value for each name, ` +
  `so the reference can get the value of another %${name} instead.`;

const headMessage = (name: string, element: string): string =>
  'Smart Forms computes an answerExpression only when it starts with a launch context or with an ' +
  `application/x-fhir-query variable that expands a ValueSet, and %${name} is neither, so the ` +
  `answers on ${element} are never computed from this expression.`;

const otherReferenceMessage = (head: string, name: string, element: string): string =>
  `Smart Forms gives an answerExpression only %${head}, the name it starts with, so %${name} has ` +
  `no value here, and the answers on ${element} are not computed from this expression when the ` +
  'reference is evaluated.';

const help =
  'declare the value as a variable with a name no other declaration uses, on this item or an ' +
  'ancestor, and reference that';

const contextHelp =
  'make it the only itemPopulationContext on a group with child items, with expression text, or ' +
  'declare the value as a variable';

const headHelp =
  'start the expression with a launch context, or with an application/x-fhir-query variable whose ' +
  'expression is a ValueSet URL, or list the answers with answerOption or answerValueSet';

export const namedExpressionNotReferenceable: LintRule = {
  meta: {
    description:
      'Reports a reference to a named expression that Smart Forms does not make available to ' +
      'other expressions.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Every %name reference in a FHIRPath expression that the selected Smart Forms renderer ' +
        'or population evaluates, when the name refers to a declaration Smart Forms stores no ' +
        'value for: a named calculatedExpression, initialExpression, enableWhenExpression, ' +
        'answerExpression, candidateExpression, contextExpression, answerOptionsToggleExpression, ' +
        'targetConstraint or cqf-expression; an itemPopulationContext population does not read; ' +
        'or an itemExtractionContext. At an answerExpression it also reports a first name that ' +
        'is neither a launch context nor an application/x-fhir-query variable that expands a ' +
        'ValueSet, and every other name the expression references.',
      why:
        'SDC lets any named expression be referenced on its element and below. Smart Forms makes ' +
        'a value available only for variables, the itemPopulationContexts population reads and ' +
        'launch contexts, so a reference to any other named expression never gets its value. ' +
        'Unless something else supplies the name, fhirpath.js fails when it evaluates the ' +
        'reference, and Smart Forms keeps the previous result. Because Smart Forms keeps one ' +
        'value for each name, the reference can instead get the value of another declaration ' +
        'of the name, or of a name the application running the form supplies. The ' +
        'renderer evaluates an answerExpression with only the name it starts with, so its other ' +
        'names never have a value there.',
      exampleMessage: message('score', 'calculatedExpression', 'item "Score" (score)', ''),
      fix:
        'Declare the value as a variable, with a name no other declaration uses, on the item or ' +
        'an ancestor, and reference that variable; for an itemPopulationContext, make it the ' +
        'only one on a group with child items, with expression text. Change the FSH rules that ' +
        'set them, then run SUSHI again.',
      limitations:
        'Under the supported integration, population then rendering, a name population makes ' +
        'available is not reported at a renderer expression, because population passes its ' +
        'names to the renderer, except at an answerExpression. A reference to a name declared ' +
        'twice on one element is left to sdc/duplicate-declaration, a name FHIRPath, FHIR or SDC ' +
        'defines to sdc/reserved-name, a variable in a language Smart Forms does not run to ' +
        'smart-forms/unsupported-expression-language, and an itemPopulationContext replaced by a ' +
        'later one of its name to smart-forms/variable-name-collision. A launchContext is not ' +
        'reported, except after the first name of an answerExpression. The rule does not say ' +
        'which value the reference gets when another declaration supplies the name, and it does ' +
        'not tell a name a host supplies apart. A variable is not reported outside an ' +
        'answerExpression: population skips item FHIRPath variables when the Questionnaire root ' +
        'has no extensions, and a reference to one from an itemPopulationContext is not ' +
        'reported. At an answerExpression, built-in names other ' +
        'than %questionnaire and %qitem are not checked, and a query that fails or a ValueSet ' +
        'that does not expand is not detected. The renderer facts come from the Smart Forms ' +
        'source; the population facts are reproduced against sdc-populate.',
    },
  },
  check(ctx) {
    const versions = requireCompat(ctx);
    if (
      !components.some((component) =>
        variableFactsAt(component, versions[component]).has('named-expression-not-stored'),
      )
    ) {
      return;
    }
    const { document, declarations } = ctx;
    const renderer = variableFactsAt('renderer', versions.renderer);
    const passesContext = renderer.has('additional-context-reaches-expressions');
    const checksAnswers = renderer.has('answer-expression-head-only');

    // How many declarations each name has on each element, of any kind.
    const counts = new Map<string, number>();
    for (const declaration of declarations) {
      const key = `${keyOf(declaration)}\n${declaration.name}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const pop = population(ctx);

    // Whether the rule stays silent about a reference to a declaration, because another rule
    // reports its root cause (S9). Each condition is checked here, whatever those rules' settings.
    const silent = (declaration: Declaration, launchContexts: boolean): boolean => {
      const { kind, site, name } = declaration;
      // sdc/duplicate-declaration: core resolves to the first one, which may not be the one a
      // component stores.
      if ((counts.get(`${keyOf(declaration)}\n${name}`) ?? 0) > 1) return true;
      // sdc/reserved-name.
      if (definerOf(name) !== undefined) return true;
      // smart-forms/unsupported-expression-language: a variable no component stores.
      if (kind === 'variable') return storedName(ctx, declaration) === undefined;
      // Whether population binds it depends on what the host supplies.
      if (kind === 'launchContext') return launchContexts;
      // smart-forms/variable-name-collision: population reads it, but a later one replaces it.
      return (
        kind === 'itemPopulationContext' &&
        site !== undefined &&
        populationReadsContext(document, site) &&
        !prerequisitesHold('populate', versions.populate, document, site)
      );
    };

    const declared = (variable: Variable | undefined): Declaration | undefined =>
      variable?.origin === 'declaration' ? variable.declaration : undefined;

    // A reference at a site other than an answerExpression. Components lists those whose stored
    // names reach the site.
    const checkReference = (
      site: ExpressionSite,
      reference: VariableReference,
      declaration: Declaration,
      among: readonly Component[],
    ): void => {
      const { name, startOffset, endOffset } = reference;
      const own = declaration.site;
      if (
        (declaration.kind !== 'namedExpression' && declaration.kind !== 'itemPopulationContext') ||
        own === undefined ||
        !isLocatedSite(own) ||
        silent(declaration, true) ||
        storedName(ctx, declaration, among) !== undefined
      ) {
        return;
      }
      const read = declaration.kind === 'itemPopulationContext' ? pop.readsContext(own) : true;
      const reason = read === true ? '' : unreadReasons[read];
      const others: RuleRelatedLocation[] = declarations
        .filter((other) => other !== declaration && storedName(ctx, other, among) === name)
        .map((other) => ({ ...where(other), message: `%${name} is also declared here` }));
      const sourceQuery = among.includes('populate')
        ? pop.bindersOf(name).find((binder) => binder.kind === 'sourceQuery')
        : undefined;
      if (sourceQuery !== undefined) {
        others.push({
          pointer: sourceQuery.pointer,
          message: `%${name} is also the name of this sourceQueries result`,
        });
      }
      const extension = extensionName(own);
      const element = elementName(document, declaration.item);
      ctx.report({
        site,
        range: { startOffset, endOffset },
        message:
          others.length === 0
            ? message(name, extension, element, reason)
            : otherValueMessage(name, extension, element, reason),
        help: declaration.kind === 'itemPopulationContext' ? contextHelp : help,
        relatedLocations: [{ site: own, message: `%${name} is declared here` }, ...others],
      });
    };

    // Whether the renderer gives an answerExpression a value for its head: a root launchContext
    // under the name population binds it under, read from the root extension array as the
    // renderer reads it (answer-expression-head-only), whether or not core declares it, or an
    // application/x-fhir-query variable that gets the expanded ValueSet, which the renderer looks
    // up by name wherever it is declared.
    const launchNames = new Set(
      launchContextsOf(document).flatMap(({ boundName }) => boundName ?? []),
    );
    let valueSetNames: ReadonlySet<string> | undefined;
    const supplied = (head: string): boolean =>
      launchNames.has(head) || (valueSetNames ??= valueSetVariables(document)).has(head);

    // The declaration a reference resolves to, as related location; none for a supplied name.
    const related = (
      declaration: Declaration | undefined,
      name: string,
    ): { relatedLocations?: RuleRelatedLocation[] } =>
      declaration === undefined
        ? {}
        : { relatedLocations: [{ ...where(declaration), message: `%${name} is declared here` }] };

    // An answerExpression, which the renderer evaluates with its head alone (P6 review, decision H).
    const checkAnswer = (
      site: LocatedSite,
      references: readonly VariableReference[],
      resolve: (name: string) => Variable | undefined,
    ): void => {
      const text = site.text ?? '';
      const head = headOf(text);
      const first = references.find(({ startOffset }) => startOffset === text.indexOf('%'));
      if (first === undefined || !first.complete || first.name !== head) return;
      // A name the renderer cannot get a value for: a declaration, or a name the host or the
      // including Questionnaire supplies. Built-in names are left to
      // smart-forms/questionnaire-variable-unavailable and the open item.
      const unsupplied = (variable: Variable | undefined, launchContexts: boolean): boolean => {
        if (variable === undefined || variable.origin === 'builtin') return false;
        const declaration = declared(variable);
        return declaration === undefined
          ? definerOf(variable.name) === undefined
          : !silent(declaration, launchContexts);
      };
      const element = elementName(document, site.item);
      if (!supplied(head)) {
        const variable = resolve(head);
        if (!unsupplied(variable, true)) return;
        ctx.report({
          site,
          range: { startOffset: first.startOffset, endOffset: first.endOffset },
          message: headMessage(head, element),
          help: headHelp,
          ...related(declared(variable), head),
        });
        return;
      }
      for (const { name, startOffset, endOffset, complete } of references) {
        if (!complete || name === head) continue;
        const variable = resolve(name);
        if (!unsupplied(variable, false)) continue;
        ctx.report({
          site,
          range: { startOffset, endOffset },
          message: otherReferenceMessage(head, name, element),
          help: `compute the answers from %${head} alone`,
          ...related(declared(variable), name),
        });
      }
    };

    for (const site of ctx.sites) {
      const readers = readBy(ctx, site);
      // readBy reads only catalogued sites, which have a location.
      if (readers.length === 0 || !isLocatedSite(site)) continue;
      const references = ctx.referencesAt(site);
      const available = ctx.variablesAt(site);
      if (references === undefined || available === undefined) continue;
      if (site.location.url === ANSWER_EXPRESSION) {
        if (checksAnswers) checkAnswer(site, references, (name) => available.resolve(name));
        continue;
      }
      // The components whose stored names reach the site: those that read it and, at a renderer
      // site, population, whose context the renderer receives (S14).
      const among = components.filter(
        (component) =>
          readers.some((reader) => reader.component === component) ||
          (component === 'populate' &&
            passesContext &&
            readers.some((reader) => reader.component === 'renderer')),
      );
      for (const reference of references) {
        if (!reference.complete) continue;
        const declaration = declared(available.resolve(reference.name));
        if (declaration !== undefined) checkReference(site, reference, declaration, among);
      }
    }
  },
};
