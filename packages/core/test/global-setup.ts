/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { build } from '../../../test/build.js';

// CLI tests run the built executable, so build core once before any test.
export default function setup(): void {
  build('@aehrc/sdc-questionnaire-lint');
}
