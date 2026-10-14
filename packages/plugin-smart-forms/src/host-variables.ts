import type { HostVariablesInput } from 'sdc-questionnaire-lint';
import { population } from './population.js';

// The names of the sourceQueries results population binds, so that sdc/undefined-variable accepts
// them.
export function hostVariables(input: HostVariablesInput): string[] {
  return population(input).sourceQueries.flatMap(({ name }) => (name === undefined ? [] : [name]));
}
