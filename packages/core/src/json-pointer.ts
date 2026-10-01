// Builds a JSON Pointer (RFC 6901) from unescaped segments: ['rules', 'sdc/x'] -> /rules/sdc~1x.
export function toPointer(segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`)
    .join('');
}

// The unescaped segments of a JSON Pointer, or undefined when it is not one.
export function parsePointer(pointer: string): string[] | undefined {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) return undefined;
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

// Whether pointer is base itself or lies beneath it.
export function isWithin(pointer: string, base: string): boolean {
  return pointer === base || pointer.startsWith(`${base}/`);
}
