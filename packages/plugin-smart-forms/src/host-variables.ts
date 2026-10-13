import type { HostVariablesInput } from 'sdc-questionnaire-lint';
import { requireCompat } from './eligibility.js';
import { sourceQueriesAt } from './facts/source-queries.js';
import { readSourceQueries, type SourceQuery } from './source-queries.js';

// The root sourceQueries whose results Smart Forms population binds, under the supported
// integration and assuming external fetches succeed (docs/smart-forms-rules.md, P4): a #id whose
// first contained Bundle with that id has an id and an entry element, and every other non-empty
// reference as sourceQuery<i>. One whose name starts with % is left out: population binds #%x as
// %x, but a host variable is written without %.
export function suppliedSourceQueries({ document, compat }: HostVariablesInput): SourceQuery[] {
  const facts = sourceQueriesAt('populate', requireCompat({ compat }).populate);
  if (!facts.has('read-from-root')) return [];
  const { subjectType } = document.resource;
  if (
    facts.has('requires-patient-subject') &&
    Array.isArray(subjectType) &&
    subjectType.length > 0 &&
    !subjectType.includes('Patient')
  ) {
    return [];
  }
  return readSourceQueries(document).filter(({ reference, name, bundle }) => {
    if (name === undefined || name.startsWith('%') || reference === undefined) return false;
    if (reference.startsWith('#')) {
      return facts.has('contained-named-by-id') && bundle?.bound === true;
    }
    return facts.has('reference-named-by-index');
  });
}

// The names of the supplied sourceQueries results, so that sdc/undefined-variable accepts them.
export function hostVariables(input: HostVariablesInput): string[] {
  return suppliedSourceQueries(input).flatMap(({ name }) => (name === undefined ? [] : [name]));
}
