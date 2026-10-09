import type { Declaration } from '../analysis/declarations.js';
import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type { ExpressionSite } from '../analysis/expression-site.js';
import type { CoreRule } from '../plugins/core-rule.js';
import { elementName } from './describe.js';

// The variable a site declares; the rule reports nothing else (D4).
const variableAt = (site: ExpressionSite, analysis: DocumentAnalysis): Declaration | undefined =>
  site.declares
    ? analysis.declarations.find(
        (declaration) => declaration.site === site && declaration.kind === 'variable',
      )
    : undefined;

// Whether the rule completes its check at a site: it reports only at variables, and completes at
// one that is referenced, or whose possible consumers were all analysed (D5).
export function completesUnusedCheck(site: ExpressionSite, analysis: DocumentAnalysis): boolean {
  const variable = variableAt(site, analysis);
  const use = variable === undefined ? undefined : analysis.uses.get(variable);
  return use === undefined || use === 'referenced' || use === 'unreferenced';
}

// Whether the rule applies at a site but cannot complete there: a variable that nothing analysed
// references, which an expression core cannot analyse may reference. One that only an expression
// with a syntax error may reference is not: that error is established, not a limitation.
export function leavesUnusedCheckIncomplete(
  site: ExpressionSite,
  analysis: DocumentAnalysis,
): boolean {
  const variable = variableAt(site, analysis);
  return variable !== undefined && analysis.uses.get(variable) === 'unknown';
}

const message = (name: string, element: string): string =>
  `%${name} is declared on ${element}, but no expression references it, so its value is never used.`;

export const unusedDeclaration: CoreRule = {
  meta: {
    description: 'Reports a variable that no expression references.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        'Looks for a variable that no other expression references: no %name in an expression ' +
        'on its item or a descendant item, or in a {{…}} fragment of a query there, resolves to ' +
        'it. A reference to a declaration of the same name on a descendant item uses that ' +
        'declaration instead, and a reference from the variable’s own expression is not a use. ' +
        'Only variables are reported: an itemPopulationContext, another named expression, a ' +
        'launchContext or an extractAllocateId has a purpose without being referenced.',
      why:
        'A variable that nothing references is computed for nothing. It is often left over ' +
        'from an edit, or a sign that an expression references a different name than intended.',
      exampleMessage: message('weight', 'item "BMI" (bmi)'),
      fix:
        'Remove the variable from the FSH, or reference it in the expressions that need its ' +
        'value, then run SUSHI again.',
      limitations:
        'The variable is not reported when an expression that could reference it is not ' +
        'analysed: CQL or another language, an Expression with only a reference, FHIRPath that ' +
        'does not parse, an expression at an uncatalogued location that names it, a reference ' +
        'after a defineVariable whose name is computed, a questionnaire-constraint, or a ' +
        'subQuestionnaire, whose module may reference it once assembled. Such a variable ' +
        'counts as unchecked, unless only expressions with a syntax error could reference it. ' +
        'Expressions in contained resources are treated as able to ' +
        'reference the variables on the root.',
    },
  },
  check(ctx, { declarations, uses }) {
    for (const declaration of declarations) {
      const { site, kind, name } = declaration;
      if (kind !== 'variable' || site === undefined || uses.get(declaration) !== 'unreferenced') {
        continue;
      }
      ctx.report({
        site,
        message: message(name, elementName(ctx.document, declaration.item)),
        help: `remove the variable, or reference %${name} where its value is needed`,
      });
    }
  },
};
