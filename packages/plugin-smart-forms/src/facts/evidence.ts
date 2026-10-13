// What shows a runtime fact (S4, S10): a reproduction test against the pinned npm package, or,
// until a harness exists, a permalink into the Smart Forms source.
export type Evidence =
  | { readonly kind: 'source-only'; readonly permalink: string }
  // test is the test file, relative to the plugin package; name is the test's full title, its
  // describe and it titles joined with ' > '.
  | { readonly kind: 'reproduced'; readonly test: string; readonly name: string };

// The release commit of renderer 1.4.0 and populate 4.7.1. Each cited file was checked to be
// identical there and at the researched checkout 7e64a22f (S11).
export const releaseCommit = 'f846e2d8fbb97049360e58cbaf6b06bae0a78cb3';
export const sourceBase = `https://github.com/aehrc/smart-forms/blob/${releaseCommit}/`;

export const rendererSource = 'packages/smart-forms-renderer/src/';
export const populateSource = 'packages/sdc-populate/src/SDCPopulateQuestionnaireOperation/utils/';
export const inAppPopulateSource = 'packages/sdc-populate/src/inAppPopulation/utils/';
export const getExpressionsFromItem = `${rendererSource}utils/getExpressionsFromItem.ts`;

// A permalink to lines of a file at the release commit.
export function source(file: string, from: number, to: number): Evidence {
  return Object.freeze({
    kind: 'source-only',
    permalink: `${sourceBase}${file}#L${String(from)}-L${String(to)}`,
  });
}

// A reproduction test against the pinned npm package.
export function reproduced(test: string, name: string): Evidence {
  return Object.freeze({ kind: 'reproduced', test, name });
}

// The reproduction tests of populate 4.7.1, by file.
export const populateLanguages = 'test/reproduction/populate-languages.test.ts';
export const populatePrerequisites = 'test/reproduction/populate-prerequisites.test.ts';
export const populateNames = 'test/reproduction/populate-names.test.ts';
export const populateEmbeddings = 'test/reproduction/populate-embeddings.test.ts';
export const populateSourceQueries = 'test/reproduction/populate-source-queries.test.ts';
export const populateVariableStorage = 'test/reproduction/populate-variable-storage.test.ts';
export const populateEvaluationOrder = 'test/reproduction/populate-evaluation-order.test.ts';

// The reproduction tests of template-extract 1.0.15, by file.
export const extractContexts = 'test/reproduction/extract-contexts.test.ts';
export const extractTemplates = 'test/reproduction/extract-templates.test.ts';
