/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', 'docs/', '.cache/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Only reporters write to stdout, through process.stdout; logging would corrupt JSON reports.
    files: ['packages/*/src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // Rules must not access the network (core-plan §5.1).
    files: ['packages/*/src/rules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: ['http', 'https', 'net', 'node:http', 'node:https', 'node:net'] },
      ],
      'no-restricted-globals': ['error', 'fetch'],
    },
  },
  prettier,
);
