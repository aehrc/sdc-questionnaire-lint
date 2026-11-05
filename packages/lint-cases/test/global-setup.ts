/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { execSync } from 'node:child_process';

// The cases are linted by the built core, as a plugin's are, so build it once before any test.
// Through a shell, because npm is npm.cmd on Windows and cannot be spawned directly.
export default function setup(): void {
  execSync('npm run build --workspace @aehrc/sdc-questionnaire-lint', { stdio: 'inherit' });
}
