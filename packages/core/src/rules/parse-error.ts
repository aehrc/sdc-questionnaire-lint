import {
  type FhirPathSyntaxProblem,
  findFhirPathSyntaxProblem,
  hasFhirPathText,
} from '../analysis/fhirpath.js';
import type { LintRule, RuleFinding } from '../plugins/contract.js';
import type { OffsetRange } from '../report/types.js';

type Described = Pick<RuleFinding, 'message' | 'help'>;

const fallback = 'This FHIRPath expression has a syntax error.';

// The parser's message in author terms, without ANTLR's list of expected tokens.
function describe(text: string, parserMessage: string | undefined): Described {
  if (text.trim() === '') return { message: 'The expression is empty.' };
  if (parserMessage === undefined) return { message: fallback };
  const missing = /^missing '([)\]}])' at '(.*)'$/.exec(parserMessage);
  if (missing) {
    const [, bracket = '', at] = missing;
    return {
      message: `A closing ${bracket} is missing.`,
      // Only when appending it makes the text parse is the end the place to add it; after a
      // trailing // comment, for example, it would land inside the comment.
      ...(at === '<EOF>' && findFhirPathSyntaxProblem(text + bracket) === undefined
        ? { help: `add ${bracket} at the end of the expression` }
        : {}),
    };
  }
  if (parserMessage.startsWith("mismatched input '<EOF>'")) {
    return { message: 'The expression ends before it is complete.' };
  }
  const unexpected = /^(?:extraneous|mismatched) input '(.+?)' expecting/.exec(parserMessage);
  if (unexpected) return { message: `The expression has an unexpected ${unexpected[1] ?? ''}.` };
  const token = /^token recognition error at: '(.)/.exec(parserMessage);
  if (token?.[1] === "'") return { message: "A string is missing its closing '." };
  if (token) return { message: `The character ${token[1] ?? ''} is not valid here.` };
  return { message: fallback };
}

// One character at the offset, or none at the end of the text; a surrogate pair stays whole.
function rangeAt(text: string, offset: number): OffsetRange {
  if (offset >= text.length) return { startOffset: offset, endOffset: offset };
  const code = text.charCodeAt(offset);
  const width = code >= 0xd800 && code <= 0xdbff && offset + 1 < text.length ? 2 : 1;
  return { startOffset: offset, endOffset: offset + width };
}

// The finding for a syntax problem in text, without its site; shared with sdc/fragment-parse-error.
export function syntaxFinding(
  text: string,
  problem: FhirPathSyntaxProblem,
): Omit<RuleFinding, 'site'> {
  const { parserMessage, offset } = problem;
  // The first clause only: what the parser saw, not what it expected.
  const clause = parserMessage?.replace(/ expecting [\s\S]*$/, '');
  return {
    ...describe(text, parserMessage),
    ...(clause === undefined ? {} : { note: `the FHIRPath parser reported: ${clause}` }),
    ...(offset === undefined ? {} : { range: rangeAt(text, offset) }),
  };
}

export const parseError: LintRule = {
  meta: {
    description: 'Reports a FHIRPath expression that does not parse.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Every expression whose language is text/fhirpath, at a catalogued location or found ' +
        'elsewhere in the Questionnaire, is parsed with fhirpath.js. An expression that ' +
        'does not parse is reported at the position where the parser found the error. FHIRPath ' +
        'embedded in an x-fhir-query is parsed by sdc/fragment-parse-error.',
      why:
        'An expression that does not parse fails when the form runs: a calculated value is never ' +
        'filled in, a question is never shown or hidden, or prefill silently does nothing.',
      exampleMessage: 'A closing ) is missing.',
      fix:
        'Correct the expression in the FSH rule that sets it, at the position the caret shows, ' +
        'then run SUSHI again. FHIRPath strings use single quotes, and every opening bracket ' +
        'needs a closing one.',
      limitations:
        'Only syntax is checked: undefined variables and wrong paths still parse, and unknown ' +
        'functions are reported by sdc/unknown-function. Expressions in other languages, such as ' +
        'CQL, are not parsed, and an x-fhir-query is left to sdc/query-syntax. Some malformed ' +
        'input makes the parser fail ' +
        'without a position; the finding then has no caret.',
    },
  },
  check(ctx) {
    for (const site of ctx.sites) {
      // Fragments are sdc/fragment-parse-error's.
      if (site.carrier !== 'expression' || !hasFhirPathText(site)) continue;
      const problem = findFhirPathSyntaxProblem(site.text);
      if (problem !== undefined) ctx.report({ site, ...syntaxFinding(site.text, problem) });
    }
  },
};
