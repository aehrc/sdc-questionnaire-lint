import type {
  ExpressionSite,
  LintRule,
  QuestionnaireDocument,
  RuleContext,
  RuleFinding,
  RuleRelatedLocation,
} from '@aehrc/sdc-questionnaire-lint';
import { isObject, type Json } from '../document.js';
import { readBy, requireCompat } from '../eligibility.js';
import { embeddingsAt } from '../facts/embeddings.js';
import { launchContextsOf } from '../launch-contexts.js';
import { readSourceQueries } from '../source-queries.js';
import { VARIABLE, X_FHIR_QUERY } from '../urls.js';

// A query population fetches and replaces embeddings in: an application/x-fhir-query variable with
// a name, or a request URL in a contained sourceQueries Bundle.
interface Query {
  readonly text: string;
  // The variable's site, or the pointer to the request URL.
  readonly at: { readonly site: ExpressionSite } | { readonly pointer: string };
  // The query in a message, such as the query of %conditions.
  readonly label: string;
}

// Whether population fetches a query site: a named application/x-fhir-query variable, on the root
// or an item, that population reads. The renderer never replaces {{…}}.
function isFetched(ctx: Pick<RuleContext, 'document' | 'compat'>, site: ExpressionSite): boolean {
  return (
    site.carrier === 'expression' &&
    site.location?.url === VARIABLE &&
    site.language === X_FHIR_QUERY &&
    site.text !== undefined &&
    site.name !== undefined &&
    site.name !== '' &&
    readBy(ctx, site).some(({ component }) => component === 'populate')
  );
}

// The request URLs of the contained Bundles the root's sourceQueries reference by #id, in contained
// order, each Bundle once. Population replaces embeddings in them too, but only in the first
// contained Bundle with the id, and only when it has an id and entries
// (createFhirPathContext.ts:559-597).
function sourceQueryUrls(document: QuestionnaireDocument): Query[] {
  const bundles = new Map<number, Json>();
  for (const { bundle } of readSourceQueries(document)) {
    if (bundle?.bound === true) {
      bundles.set(bundle.containedIndex, bundle.resource);
    }
  }
  return [...bundles]
    .sort(([a], [b]) => a - b)
    .flatMap(([index, resource]) => {
      const entries = Array.isArray(resource.entry) ? resource.entry : [];
      return entries.flatMap((entry: unknown, entryIndex): Query[] => {
        const url = isObject(entry) && isObject(entry.request) ? entry.request.url : undefined;
        return typeof url === 'string'
          ? [
              {
                text: url,
                at: {
                  pointer: `${document.resourcePointer}/contained/${String(index)}/entry/${String(entryIndex)}/request/url`,
                },
                label: `a request URL in the sourceQueries Bundle ${String(resource.id)}`,
              },
            ]
          : [];
      });
    });
}

// Population's recognition of an embedding: {{% and at least one character other than a line
// break, up to the first }}. JavaScript's . excludes the line and paragraph separators too.
const embeddingPattern = /\{\{%(.*?)\}\}/;

// What replaces an embedding while simulating population's replacement: a character no query has.
const sentinel = '\u0000';

const notRecognisedMessage = (reason: string): string =>
  `Smart Forms does not replace this embedding, because it ${reason}, so the query is sent ` +
  'with its braces.';

const noLaunchContextMessage =
  'Smart Forms replaces {{…}} only when a launch context is supplied, and this Questionnaire ' +
  'declares none, so the query is sent with its braces.';

const invalidPatternMessage =
  'Smart Forms builds a regular expression from the text inside {{…}}, and this text is not a ' +
  'valid one, so population of the whole form fails.';

const unmatchedMessage =
  'Smart Forms builds a regular expression from the text inside {{…}}, and this text does not ' +
  'match itself, so the query is sent with its braces.';

const corruptsMessage = (labels: readonly string[]): string =>
  'Smart Forms builds a regular expression from the text inside {{…}} and applies it to every ' +
  `query, and this text also matches other text in ${list(labels)}, so it corrupts ` +
  `${labels.length === 1 ? 'that URL' : 'those URLs'}.`;

const notLaunchContextMessage = (head: string): string =>
  `Smart Forms fills {{%…}} only from a launch context, and ${head} is not one, so the query ` +
  'is sent with "undefined".';

const noPathMessage = (missing: string): string =>
  `Smart Forms fills {{%…}} with the value of a path on a launch context, and this embedding ` +
  `has ${missing}, so the query is sent with an empty value.`;

const unavailableMessage = (head: string, name: string): string =>
  `Smart Forms evaluates the text after %${head} with only the launch resource, so %${name} is ` +
  'not available and the embedding becomes empty.';

const patternHelp =
  'keep the text inside {{…}} to a launch context and a path, such as {{%patient.id}}';

const unavailableHelp =
  'inside {{…}} only %context, %ucum, %terminologyUrl and %async are available, and ' +
  '%fhirServerUrl when a source server is configured';

function list(labels: readonly string[]): string {
  return labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1) ?? ''}`;
}

// The finding for an embedding population does not recognise, or undefined when it recognises the
// whole fragment. skip: population recognises an embedding inside the fragment only, as in
// {{{%patient.id}}, which the rule does not check.
function notRecognised(text: string): Omit<RuleFinding, 'site'> | 'skip' | undefined {
  const match = embeddingPattern.exec(`{{${text}}}`);
  if (match !== null && match[1] !== '') return match.index === 0 ? undefined : 'skip';
  if (match !== null && match.index !== 0) return 'skip';
  const reason = !text.startsWith('%')
    ? 'does not start with {{%'
    : text === '%'
      ? 'has nothing after {{%'
      : 'contains a line break';
  const trimmed = text.trim();
  const fixable = trimmed !== text && embeddingPattern.exec(`{{${trimmed}}}`)?.index === 0;
  return {
    message: notRecognisedMessage(reason),
    ...(fixable ? { help: `write it as {{${trimmed}}}` } : {}),
  };
}

// The finding for an embedding whose pattern population cannot compile, or that does not replace
// exactly its own embedding in every query; undefined when it does.
function patternProblem(
  text: string,
  query: ExpressionSite,
  queries: readonly Query[],
): Omit<RuleFinding, 'site'> | undefined {
  let pattern: RegExp;
  try {
    pattern = new RegExp(`{{${text}}}`, 'g');
  } catch {
    return { message: invalidPatternMessage, help: patternHelp };
  }
  const own = `{{${text}}}`;
  if (own.replace(pattern, () => sentinel) === own) {
    return { message: unmatchedMessage, help: patternHelp };
  }
  // Population applies the pattern to every query: any match that is not an identical embedding,
  // in this query or another, corrupts the query it is in.
  const corrupted = queries.filter((target) =>
    [...target.text.matchAll(pattern)].some(([matched]) => matched !== own),
  );
  if (corrupted.length === 0) return undefined;
  const isOwn = (target: Query): boolean => 'site' in target.at && target.at.site === query;
  return {
    message: corruptsMessage(
      corrupted.map((target) => (isOwn(target) ? 'this query' : target.label)),
    ),
    help: patternHelp,
    relatedLocations: corrupted
      .filter((target) => !isOwn(target))
      .map((target): RuleRelatedLocation => ({ ...target.at, message: 'this query is corrupted' })),
  };
}

export const unsupportedQueryEmbedding: LintRule = {
  meta: {
    description:
      'Reports a {{…}} embedding in an x-fhir-query that Smart Forms population does not fill ' +
      'as written.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Every {{…}} embedding in a named application/x-fhir-query variable, on the ' +
        'Questionnaire root or an item, that the selected Smart Forms population fetches. It ' +
        'reports the first problem of each embedding: population does not recognise it; the ' +
        'Questionnaire declares no launch context; its text is not a valid regular expression; ' +
        'its regular expression does not replace exactly its own embedding, in its query or in ' +
        'another query; the text before the first . is not a launch context; or the path ' +
        'references a name population does not supply there.',
      why:
        'Smart Forms population replaces {{%name.path}} with the value of the path on the ' +
        'launch context name, by building an unescaped regular expression from the text and ' +
        'applying it to every query in the form. An embedding it does not replace is sent with ' +
        'its braces; a head that is not a launch context sends "undefined"; a path that uses ' +
        'another name sends an empty value; a regular expression that matches other text ' +
        'corrupts the query URL; and an invalid one fails population of the whole form.',
      exampleMessage: notLaunchContextMessage('practitioner'),
      fix:
        'Write each embedding as {{%launchContext.path}}, such as {{%patient.id}}, with a launch ' +
        'context declared on the Questionnaire root and a path without function calls, indexers ' +
        'or the characters ( ) [ ] { } * + ? | ^ $ \\. To use a value from another variable, ' +
        'fetch the resources in the query and filter them in FHIRPath instead. Change the FSH ' +
        'rule that sets the query, then run SUSHI again.',
      limitations:
        'Not checked: whether the application supplies each declared launch context at run ' +
        'time; values are inserted without URL encoding; a result that is not a primitive, such ' +
        'as %patient.name, is sent as [object Object]; only the first result is used; a path ' +
        'with no result is sent as "undefined"; and the order in which population replaces ' +
        'several embeddings. Embeddings in a sourceQueries Bundle URL, in a variable with ' +
        'another language or no name, and at any other location are not checked; ' +
        'smart-forms/unsupported-expression-language reports a query that Smart Forms ignores. A ' +
        'name that is not available anywhere is left to sdc/undefined-variable, and a fragment ' +
        'that does not parse to sdc/fragment-parse-error, which skips the last check. The ' +
        'facts are reproduced against sdc-populate.',
    },
  },
  check(ctx) {
    const versions = requireCompat(ctx);
    const facts = embeddingsAt('populate', versions.populate);
    if (!facts.has('recognised-by-pattern')) return;
    const fetched = ctx.sites.filter((site) => isFetched(ctx, site));
    if (fetched.length === 0) return;
    const queries: Query[] = [
      ...fetched.map((site) => ({
        text: site.text ?? '',
        at: { site },
        label: `the query of %${site.name ?? ''}`,
      })),
      ...sourceQueryUrls(ctx.document),
    ];
    // The root launchContexts: any, of any shape, counts as declared, and their names are read by
    // URL, the first name sub-extension's valueId, else its valueCoding.code. Population fills
    // embeddings only under the name it binds a launch resource under, read by position
    // (launch-context-named-by-position), so a launchContext not in name, type order is read here
    // by URL, as SDC defines it, not as populate reads it: that is aehrc/smart-forms#2161, which an
    // open item tracks. An empty valueId is left to the Validator (S9). Population supplies only
    // some of them at run time, which the rule does not check.
    const launch = launchContextsOf(ctx.document);
    const launchNames = launch.flatMap(({ byUrl }) => byUrl.name ?? []);
    const supplied = new Set(facts.get('evaluated-with-only')?.names ?? []);

    // Each fragment directly follows its query site.
    let query: ExpressionSite | undefined;
    for (const site of ctx.sites) {
      if (site.carrier === 'expression') query = fetched.includes(site) ? site : undefined;
      if (site.carrier !== 'fragment' || query === undefined || site.text === undefined) continue;
      if (site.expressionPointer !== query.expressionPointer) continue;
      const text = site.text;
      const whole = { startOffset: 0, endOffset: text.length };

      // 1. Population does not recognise the embedding.
      const unrecognised = notRecognised(text);
      if (unrecognised === 'skip') continue;
      if (unrecognised !== undefined) {
        ctx.report({ site, range: whole, ...unrecognised });
        continue;
      }
      const dot = text.indexOf('.');
      const head = dot === -1 ? text.slice(1) : text.slice(1, dot);

      // 2. No launch context, so nothing is replaced and no other problem can occur.
      if (facts.has('replaced-only-with-launch-resource') && launch.length === 0) {
        ctx.report({
          site,
          range: whole,
          message: noLaunchContextMessage,
          help: /^[A-Za-z_][A-Za-z0-9_]*$/.test(head)
            ? `declare a launch context named ${head} on the Questionnaire root`
            : 'declare the launch context the embedding uses, such as patient',
        });
        continue;
      }

      // 3 and 4. The unescaped regular expression fails, or does not replace exactly the embedding.
      if (facts.has('replaced-by-unescaped-pattern')) {
        const problem = patternProblem(text, query, queries);
        if (problem !== undefined) {
          ctx.report({ site, range: whole, ...problem });
          continue;
        }
      }

      // 5. The head is not a launch context, or there is no path after it.
      if (facts.has('head-is-launch-context')) {
        const isLaunch = launchNames.includes(head);
        const example = launchNames[0] ?? 'patient';
        const help = isLaunch
          ? `add the path to the value, such as %${head}.id`
          : `use a launch context declared on the Questionnaire root, such as %${example}.id`;
        if (dot === -1 || head === '') {
          ctx.report({
            site,
            range: whole,
            message: noPathMessage(
              head === '' ? 'no launch context before the first .' : `no path after %${head}`,
            ),
            help,
          });
          continue;
        }
        if (!isLaunch) {
          ctx.report({ site, range: whole, message: notLaunchContextMessage(head), help });
          continue;
        }
      }

      // 6. The path references a name core resolves but population does not supply there. Names
      // that do not resolve are sdc/undefined-variable's.
      if (facts.has('evaluated-with-only')) {
        const references = ctx.referencesAt(site);
        const available = ctx.variablesAt(site);
        if (references === undefined || available === undefined) continue;
        const unavailable = references.find(
          ({ name, startOffset, complete }) =>
            startOffset > 0 &&
            complete &&
            !supplied.has(name) &&
            available.resolve(name) !== undefined,
        );
        if (unavailable !== undefined) {
          ctx.report({
            site,
            range: { startOffset: unavailable.startOffset, endOffset: unavailable.endOffset },
            message: unavailableMessage(head, unavailable.name),
            help: unavailableHelp,
          });
        }
      }
    }
  },
};
