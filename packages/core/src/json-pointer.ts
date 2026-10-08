import { isObject } from './object.js';

// Builds a JSON Pointer (RFC 6901) from unescaped segments: ['rules', 'sdc/x'] -> /rules/sdc~1x.
export function toPointer(segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

// The report schema's JSON Pointer pattern.
export const jsonPointerPattern = /^(?:\/(?:[^~/]|~[01])*)*$/;

// The value at a JSON Pointer below root, or undefined when there is none.
export function valueAt(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  let value = root;
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(value)) value = (value as unknown[])[Number(key)];
    else if (isObject(value)) value = value[key];
    else return undefined;
  }
  return value;
}
