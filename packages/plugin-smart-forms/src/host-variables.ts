import type { HostVariablesInput } from 'sdc-questionnaire-lint';
import { requireCompat } from './eligibility.js';
import { sourceQueriesAt } from './facts/source-queries.js';
import { readSourceQueries } from './source-queries.js';

// The names Smart Forms population binds the results of the root sourceQueries to, under the
// supported integration and assuming external fetches succeed (docs/smart-forms-rules.md, P4): a
// #id whose first contained Bundle with that id has an id and an entry element, and every other
// non-empty reference as sourceQuery<i>. A name that starts with % is left out: population binds
// #%x as %x, but a host variable is written without %.
export function hostVariables({ document, compat }: HostVariablesInput): string[] {
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
  return readSourceQueries(document).flatMap(({ reference, name, bundle }) => {
    if (name === undefined || name.startsWith('%') || reference === undefined) return [];
    if (reference.startsWith('#')) {
      const bound =
        facts.has('contained-named-by-id') &&
        bundle !== undefined &&
        Boolean(bundle.resource.id) &&
        Boolean(bundle.resource.entry);
      return bound ? [name] : [];
    }
    return facts.has('reference-named-by-index') ? [name] : [];
  });
}
