/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { Ajv } from 'ajv';
import addFormatsPlugin from 'ajv-formats';
import { expect } from 'vitest';
import { readJson } from './report.js';

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsPlugin.default;

// The OASIS SARIF 2.1.0 errata01 schema, unchanged; test/fixtures/sarif/README.md gives its
// source, checksum and notices. It is draft-04, which Ajv 8 does not read. Its only draft-04 keywords are the top-level id and
// $schema, so renaming id to $id and dropping $schema gives the same schema as draft-07.
function draft07Schema(): object {
  const url = new URL('../fixtures/sarif/sarif-schema-2.1.0.json', import.meta.url);
  const { id, ...rest } = readJson(url) as Record<string, unknown>;
  delete rest.$schema;
  return { $id: id, ...rest };
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export const validateSarifSchema = ajv.compile(draft07Schema());

// Fails with every schema error when the document is not valid SARIF 2.1.0.
export function expectValidSarif(document: unknown): void {
  const valid = validateSarifSchema(document);
  expect(validateSarifSchema.errors ?? [], 'SARIF schema errors').toEqual([]);
  expect(valid).toBe(true);
}
