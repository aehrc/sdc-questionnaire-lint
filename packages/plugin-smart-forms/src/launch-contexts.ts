/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { QuestionnaireDocument } from '@aehrc/sdc-questionnaire-lint';
import { arrayOf, isObject, type Json } from './document.js';
import { LAUNCH_CONTEXT } from './urls.js';

// The root launchContexts, each read every way Smart Forms reads one (docs/smart-forms-rules.md,
// Shared plugin infrastructure, launchContexts). The reader knows no facts: which reading a component uses, and for
// which version, is a runtime fact the caller checks. Only the root extension array is read, as
// populate and the renderer read it (inputParameters.ts:117-123; extractLaunchContext.ts:5-20), so
// a launchContext on an item or in the root modifierExtension is not one. Not ctx.declarations:
// core reads a name by URL, valueCoding.code first, and declares only launchContexts whose name it
// can read, the root modifierExtension's included.

// A launchContext's name and resource type, from one reading. A name is the sub-extension's
// valueId, else its valueCoding.code, and an empty one is none.
export interface LaunchContextReading {
  readonly name: string | undefined;
  readonly type: string | undefined;
}

export interface LaunchContext {
  // The extension, for findings and related locations.
  readonly pointer: string;
  // Its index in the root extension array.
  readonly index: number;
  // Read by URL, in any order: the first name sub-extension's name and the first type
  // sub-extension's valueCode.
  readonly byUrl: LaunchContextReading;
  // Read by position: the first sub-extension's name and the second's valueCode, whatever their
  // URLs (inputParameters.ts:346-351).
  readonly byPosition: LaunchContextReading;
  // Whether population reads it as an input (population-needs-input): a name sub-extension with a
  // valueId or a valueCoding.code, and a type sub-extension with a valueCode, found by URL in any
  // order (inputParameters.ts:97-121). An empty valueId beside a valueCoding.code counts.
  readonly input: boolean;
  // The name population binds the launch resource under (launch-context-named-by-position): an
  // input with both a name and a type by position. Whether a resource is bound under it depends
  // on what the host supplies.
  readonly boundName: string | undefined;
}

const nameOf = (part: unknown): string | undefined => {
  if (!isObject(part)) return undefined;
  const name = part.valueId ?? (isObject(part.valueCoding) ? part.valueCoding.code : undefined);
  return typeof name === 'string' && name !== '' ? name : undefined;
};

const typeOf = (part: unknown): string | undefined =>
  isObject(part) && typeof part.valueCode === 'string' && part.valueCode !== ''
    ? part.valueCode
    : undefined;

function read(document: QuestionnaireDocument, extension: Json, index: number): LaunchContext {
  const parts = arrayOf(extension.extension);
  const names = parts.filter(isObject).filter((part) => part.url === 'name');
  const types = parts.filter(isObject).filter((part) => part.url === 'type');
  const byUrl = { name: nameOf(names[0]), type: typeOf(types[0]) };
  const byPosition = { name: nameOf(parts[0]), type: typeOf(parts[1]) };
  const input =
    names.some((part) =>
      Boolean(part.valueId || (isObject(part.valueCoding) && part.valueCoding.code)),
    ) && types.some((part) => Boolean(part.valueCode));
  return {
    pointer: `${document.resourcePointer}/extension/${String(index)}`,
    index,
    byUrl,
    byPosition,
    input,
    boundName: input && byPosition.type !== undefined ? byPosition.name : undefined,
  };
}

// Every launchContext in the root extension array, of any shape, in array order.
export function launchContextsOf(document: QuestionnaireDocument): readonly LaunchContext[] {
  return arrayOf(document.resource.extension).flatMap((extension, index) =>
    isObject(extension) && extension.url === LAUNCH_CONTEXT
      ? [read(document, extension, index)]
      : [],
  );
}
