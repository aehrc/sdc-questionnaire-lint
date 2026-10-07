// Builds a JSON Pointer (RFC 6901) from unescaped segments: ['rules', 'sdc/x'] -> /rules/sdc~1x.
export function toPointer(segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

// The report schema's JSON Pointer pattern.
export const jsonPointerPattern = /^(?:\/(?:[^~/]|~[01])*)*$/;
