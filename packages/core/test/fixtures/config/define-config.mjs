/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// Resolves the package through the workspace link, as a user's config resolves the installed one.
import { defineConfig } from '@aehrc/sdc-questionnaire-lint';

export default defineConfig({ files: ['fsh-generated/resources'] });
