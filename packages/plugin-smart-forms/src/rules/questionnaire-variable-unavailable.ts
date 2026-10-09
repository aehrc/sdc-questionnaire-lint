import type { ExpressionSite, LintRule, RuleContext } from 'sdc-questionnaire-lint';
import { elementName, itemOf } from '../document.js';
import { type Reader, readBy, requireCompat } from '../eligibility.js';
import { unsuppliedAt } from '../facts/names.js';
import {
  ANSWER_EXPRESSION,
  ANSWER_OPTIONS_TOGGLE_EXPRESSION,
  CALCULATED_EXPRESSION,
  CQF_EXPRESSION,
  ENABLE_WHEN_EXPRESSION,
  INITIAL_EXPRESSION,
  ITEM_POPULATION_CONTEXT,
  TARGET_CONSTRAINT,
  VARIABLE,
} from '../urls.js';
import { extensionName, isLocatedSite, type LocatedSite } from './language-sites.js';

// What is left when the evaluation fails, by location: the component catches the failure and keeps
// the previous result (docs/plans/smart-forms-p2-questionnaire-variable-unavailable.md, What the
// renderer does when a reference throws).
const consequences: Readonly<Record<string, string>> = {
  [CALCULATED_EXPRESSION]: 'the answer is not calculated from it',
  [ENABLE_WHEN_EXPRESSION]:
    'it does not change whether the item is enabled; the item starts disabled',
  [TARGET_CONSTRAINT]: 'the constraint result is not updated from this evaluation',
  [ANSWER_OPTIONS_TOGGLE_EXPRESSION]: 'its options are not toggled; they start disabled',
  [ITEM_POPULATION_CONTEXT]: 'the group is not prefilled',
};

const cqfConsequences: Readonly<Record<string, string>> = {
  text: 'the text is not updated from it',
  prefix: 'the prefix is not updated from it',
  answerValueSet: 'the answer value set is not updated from it',
};

function consequence(site: LocatedSite, readers: readonly Reader[]): string {
  const { url } = site.location;
  if (url === VARIABLE) {
    return site.name === undefined || site.name === ''
      ? 'the variable gets no value from it'
      : `%${site.name} gets no value from it`;
  }
  if (url === INITIAL_EXPRESSION) {
    // Population reads only the first initialExpression; the renderer reads the first text/fhirpath
    // one, to repopulate the form.
    return readers.some(({ component }) => component === 'populate')
      ? 'the answer is not prefilled'
      : 'the answer is not refilled from it when the form is repopulated';
  }
  if (url === CQF_EXPRESSION) return cqfConsequences[site.element ?? ''] ?? 'it has no effect';
  return consequences[url] ?? 'it has no effect';
}

const message = (name: string, extension: string, element: string, result: string): string =>
  `Smart Forms does not supply %${name}, so this ${extension} on ${element} fails when the ` +
  `reference is evaluated, and ${result}.`;

// The renderer evaluates an answerExpression only when the name before the first . names a launch
// context or a query variable, and gives it no other name, so it is never evaluated with %name as
// that head, and fails when %name comes later.
const answerMessage = (name: string, element: string): string =>
  `Smart Forms does not supply %${name} to an answerExpression, so its answers on ${element} ` +
  'are not computed from this expression.';

const copyHelp = 'copy the value the expression needs from the Questionnaire into the expression';

// The literal to use for %qitem.linkId, when that is what the reference reads.
function linkIdHelp(
  ctx: Pick<RuleContext, 'document'>,
  site: ExpressionSite,
  name: string,
  endOffset: number,
): string | undefined {
  if (name !== 'qitem' || site.item === undefined) return undefined;
  if (!/^\s*\.\s*linkId\b/.test(site.text?.slice(endOffset) ?? '')) return undefined;
  const linkId = itemOf(ctx.document, site.item)?.linkId;
  return typeof linkId === 'string'
    ? `use the literal value instead, such as '${linkId}'`
    : undefined;
}

// Every name a declaration in the form has. A declaration is among the available variables of its
// own site, and a launchContext among those of every catalogued site, so the union over the sites
// covers every declaration except an extractAllocateId no extraction site can see; Smart Forms
// gives that name only to template extraction anyway.
function declaredNames(ctx: Pick<RuleContext, 'sites' | 'variablesAt'>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const site of ctx.sites) {
    for (const variable of ctx.variablesAt(site)?.variables ?? []) {
      if (variable.origin === 'declaration') names.add(variable.name);
    }
  }
  return names;
}

export const questionnaireVariableUnavailable: LintRule = {
  meta: {
    description:
      'Reports a reference to %questionnaire or %qitem, which Smart Forms does not supply.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Every %questionnaire and %qitem reference in a FHIRPath expression that the selected ' +
        'Smart Forms renderer or population evaluates: variables, calculatedExpression, ' +
        'enableWhenExpression, answerExpression, the cqf-expressions on item text, prefix and ' +
        'answerValueSet, targetConstraint, answerOptionsToggleExpression, initialExpression and ' +
        'itemPopulationContext.',
      why:
        'SDC defines %questionnaire and %qitem, but Smart Forms supplies neither. fhirpath.js ' +
        'fails on a reference to an undefined environment variable when the reference is ' +
        'evaluated, and Smart Forms catches the failure and keeps the previous result: a ' +
        'variable gets no value, an answer is not calculated or prefilled, an item starts ' +
        'disabled, or a group is not prefilled.',
      exampleMessage: message(
        'questionnaire',
        'variable',
        'the Questionnaire root',
        '%title gets no value from it',
      ),
      fix:
        'Copy the value the expression needs from the Questionnaire into the expression, such ' +
        "as the item's linkId as a string for %qitem.linkId, in the FSH rule that sets it, then " +
        'run SUSHI again. If the application running the form supplies the name through Smart ' +
        "Forms' additionalContext, suppress the finding with a reason that names the application.",
      limitations:
        'Not checked: expressions inside {{…}} in a query, expressions at locations no Smart ' +
        'Forms component reads, and a reference after a defineVariable with a computed name. ' +
        'Expressions that use a variable whose evaluation failed fail too, but are not reported ' +
        'separately. A host that supplies the name through additionalContext is handled by a ' +
        'suppression; this does not apply to an answerExpression, whose context no host can ' +
        'reach. The rule is silent for a name the form declares anywhere, which ' +
        'sdc/reserved-name reports. The renderer facts come from the Smart Forms source; the ' +
        'population facts are reproduced against sdc-populate.',
    },
  },
  check(ctx) {
    const versions = requireCompat(ctx);
    let declared: ReadonlySet<string> | undefined;
    for (const site of ctx.sites) {
      const readers = readBy(ctx, site);
      // readBy reads only catalogued sites, which have a location.
      if (readers.length === 0 || !isLocatedSite(site)) continue;
      const references = ctx.referencesAt(site);
      const available = ctx.variablesAt(site);
      if (references === undefined || available === undefined) continue;
      for (const { name, startOffset, endOffset, complete } of references) {
        if (!complete || available.resolve(name)?.origin !== 'builtin') continue;
        if (
          !readers.some(({ component }) => unsuppliedAt(component, versions[component]).has(name))
        )
          continue;
        // Silent for a name the form declares anywhere: sdc/reserved-name reports the declaration
        // (S9).
        declared ??= declaredNames(ctx);
        if (declared.has(name)) continue;
        const element = elementName(ctx.document, site.item);
        const answer = site.location.url === ANSWER_EXPRESSION;
        ctx.report({
          site,
          range: { startOffset, endOffset },
          message: answer
            ? answerMessage(name, element)
            : message(name, extensionName(site), element, consequence(site, readers)),
          help: linkIdHelp(ctx, site, name, endOffset) ?? copyHelp,
          ...(answer
            ? {}
            : {
                note: `if the application running the form supplies %${name}, suppress this finding with a reason that names the application`,
              }),
        });
      }
    }
  },
};
