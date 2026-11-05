/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { HostVariablesInput } from '@aehrc/sdc-questionnaire-lint';
import { population } from './population.js';

// The names of the sourceQueries results population binds, so that sdc/undefined-variable accepts
// them.
export function hostVariables(input: HostVariablesInput): string[] {
  return population(input).sourceQueries.flatMap(({ name }) => (name === undefined ? [] : [name]));
}
