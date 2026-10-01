import { readFile } from 'node:fs/promises';
import { isObject } from '../config/validate.js';
import { describeError, LintFailure } from '../failure.js';
import { parseJson } from '../json.js';
import type { LocalResource, QuestionnaireDocument } from '../plugins/types.js';
import type { InputFile } from './paths.js';

export interface ReadResult {
  documents: QuestionnaireDocument[];
  // read: every parsed file; skipped: parsed files with neither a Questionnaire nor a Bundle.
  files: { read: number; skipped: number };
}

async function parseFile(file: InputFile): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file.path, 'utf8');
  } catch (error) {
    throw new LintFailure({
      code: 'INPUT_UNREADABLE',
      path: file.display,
      message: `cannot read input ${file.display}: ${describeError(error)}`,
      help: 'check the permissions of the input file',
    });
  }
  try {
    // Tolerate a byte order mark, which JSON.parse rejects.
    return parseJson(text.startsWith('﻿') ? text.slice(1) : text);
  } catch (error) {
    throw new LintFailure({
      code: 'INPUT_INVALID_JSON',
      path: file.display,
      message: `input ${file.display} is not valid JSON: ${describeError(error)}`,
      help: 'regenerate the file with sushi, or fix the JSON at that position',
    });
  }
}

// A Questionnaire is one document; a Bundle gives one per Questionnaire entry, with every entry
// resource kept as a local reference target. Any other JSON is skipped.
function classify(file: InputFile, json: unknown): QuestionnaireDocument[] | 'skipped' {
  if (!isObject(json)) return 'skipped';
  if (json.resourceType === 'Questionnaire') {
    return [{ file: file.display, resource: json, resourcePointer: '', localResources: [] }];
  }
  if (json.resourceType !== 'Bundle') return 'skipped';

  const entries = Array.isArray(json.entry) ? (json.entry as unknown[]) : [];
  const localResources: LocalResource[] = [];
  entries.forEach((entry, index) => {
    if (isObject(entry) && isObject(entry.resource)) {
      localResources.push({
        pointer: `/entry/${String(index)}/resource`,
        resource: entry.resource,
      });
    }
  });
  // A Bundle without a Questionnaire is read, but not counted as skipped.
  return localResources
    .filter(({ resource }) => resource.resourceType === 'Questionnaire')
    .map(({ pointer, resource }) => ({
      file: file.display,
      resource,
      resourcePointer: pointer,
      localResources,
    }));
}

export async function readInputs(files: readonly InputFile[]): Promise<ReadResult> {
  const documents: QuestionnaireDocument[] = [];
  let skipped = 0;
  for (const file of files) {
    const classified = classify(file, await parseFile(file));
    if (classified === 'skipped') skipped++;
    else documents.push(...classified);
  }
  return { documents, files: { read: files.length, skipped } };
}
