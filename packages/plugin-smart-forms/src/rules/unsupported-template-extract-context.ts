import type { ExpressionSite, LintRule } from 'sdc-questionnaire-lint';
import { isObject, resolve } from '../document.js';
import { templateExtractVersion } from '../eligibility.js';
import { extractionAt } from '../facts/extraction.js';
import { extractedTemplates } from '../templates.js';
import { FHIRPATH, TEMPLATE_EXTRACT_CONTEXT } from '../urls.js';

const escape = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1');

// The pointer of the valueExpression of each templateExtractContext template-extract reads but
// ignores in a template: the first of its extension array, with a valueExpression and no string
// valueString. An empty valueString is left to the Validator. template-extract walks every
// extension array at any depth, but never modifierExtension, and the template's own extension is
// skipped: template-extract misextracts a context there even as valueString, so the help would
// mislead.
function* ignoredContexts(node: unknown, pointer: string, root = true): Generator<string> {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      yield* ignoredContexts(child, `${pointer}/${String(index)}`, false);
    }
    return;
  }
  if (!isObject(node)) return;
  for (const [key, value] of Object.entries(node)) {
    const at = `${pointer}/${escape(key)}`;
    if (key === 'extension' && Array.isArray(value) && !root) {
      const index = value.findIndex(
        (each) => isObject(each) && each.url === TEMPLATE_EXTRACT_CONTEXT,
      );
      const context: unknown = value[index];
      if (
        isObject(context) &&
        isObject(context.valueExpression) &&
        typeof context.valueString !== 'string'
      ) {
        yield `${at}/${String(index)}/valueExpression`;
      }
    }
    yield* ignoredContexts(value, at, false);
  }
}

const withoutContext =
  'When Smart Forms extracts this template, it ignores this templateExtractContext because it ' +
  'reads only valueString, so the values below it are extracted without this context';

const message = (name: string | undefined): string =>
  name === undefined
    ? `${withoutContext}.`
    : `${withoutContext}, and %${name} is never bound to its value.`;

function help(site: ExpressionSite, name: string | undefined): string {
  const set =
    site.language === FHIRPATH && site.text !== undefined
      ? 'set the context as valueString with the same FHIRPath'
      : 'set the context as valueString with a FHIRPath expression';
  return name === undefined
    ? set
    : `${set}, and rewrite the values below it without %${name}: Smart Forms binds no name to a context`;
}

export const unsupportedTemplateExtractContext: LintRule = {
  meta: {
    description:
      'Reports a templateExtractContext Smart Forms ignores because it is not a valueString.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Runs only when compat selects template-extract. In each template Smart Forms extracts, ' +
        "a contained resource referenced by the first #id template slice of an item's " +
        'templateExtract, a templateExtractContext with a valueExpression and no valueString is ' +
        'reported, when it is the first templateExtractContext in its extension array. Every ' +
        'extension array in the template is checked, at any depth, including primitive ' +
        'extensions and resources contained in the template, except modifierExtension.',
      why:
        'Smart Forms template extraction reads a templateExtractContext only from valueString. ' +
        'It ignores a valueExpression with a warning and goes on, so the values below the context ' +
        'are evaluated against an enclosing context, or else against the response item of the ' +
        'item that references the template, the element is not repeated for each result of the ' +
        'context, and the extension is left in the extracted resource. It binds no name to any ' +
        'context, valueString included.',
      exampleMessage: message(undefined),
      fix:
        'Write the context as valueString with a FHIRPath expression, in place of its ' +
        'valueExpression, in the FSH rule that sets it, then run SUSHI again. Rewrite the values ' +
        'below a named context without its name.',
      limitations:
        'Not reported: a context with no language, or with neither expression nor reference, ' +
        'which has no expression site and which the Validator reports; a templateExtractContext ' +
        'after the first in its extension array, which Smart Forms never reads; one in the ' +
        "template resource's own extension, which Smart Forms misextracts even as valueString; " +
        'templates referenced only from the Questionnaire root, by something other than a #id, ' +
        'or by a #id matching no contained resource, which Smart Forms never extracts. Whether ' +
        'the response has an item for the template is not checked, so a template Smart Forms ' +
        'skips for a given response is still reported.',
    },
  },
  check(ctx) {
    const version = templateExtractVersion(ctx);
    if (version === undefined) return;
    const facts = extractionAt(version);
    if (!facts.has('context-read-only-from-value-string')) return;
    const sites = new Map(
      ctx.sites
        .filter(({ carrier }) => carrier === 'expression')
        .map((site) => [site.expressionPointer, site]),
    );
    const contained = `${ctx.document.resourcePointer}/contained`;
    for (const index of extractedTemplates(ctx.document)) {
      const pointer = `${contained}/${String(index)}`;
      for (const at of ignoredContexts(resolve(ctx.document, pointer), pointer)) {
        // No site without a language, or with neither expression nor reference (decision O).
        const site = sites.get(at);
        if (site === undefined) continue;
        const name =
          site.name !== undefined && site.name !== '' && facts.has('no-context-name')
            ? site.name
            : undefined;
        ctx.report({ site, message: message(name), help: help(site, name) });
      }
    }
  },
};
