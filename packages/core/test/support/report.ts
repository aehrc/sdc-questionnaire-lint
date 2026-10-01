import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsPlugin from 'ajv-formats';

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsPlugin.default;

export const docsDir = new URL('../../../../docs/', import.meta.url);

export function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

// Schema-only validation; read validateReportSchema.errors after a false result.
export const validateReportSchema = ajv.compile(
  readJson(new URL('schemas/lint-report.schema.json', docsDir)) as object,
);
