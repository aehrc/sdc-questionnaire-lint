// Where a finding is, in the words every human-facing format uses: its FSH line when mapped,
// otherwise its compiled JSON or its config entry. Shared so the formats cannot drift apart.
import type {
  ConfigurationLocation,
  Finding,
  QuestionnaireLocation,
  RelatedLocation,
  ResourceIdentity,
  SourceLocation,
  SourceMapResult,
} from './types.js';

export type UnmappedReason = Extract<SourceMapResult, { status: 'unmapped' }>['reason'];

export const unmappedReasons: Record<UnmappedReason, string> = {
  ambiguous: 'the expression appears more than once',
  multiline: 'the expression spans several lines',
  'not-found': 'the expression was not found in the FSH sources',
  'source-unavailable': 'no FSH sources are available',
};

// Where a finding, or one of its related locations, is: an FSH range, a compiled JSON site with
// the reason it is not mapped, or a config entry.
export type PrimaryLocation =
  | { kind: 'source'; location: SourceLocation }
  | {
      kind: 'compiled';
      file: string;
      pointer: string;
      resource: ResourceIdentity;
      reason: UnmappedReason;
    }
  | { kind: 'config'; file: string; pointer: string };

export function primaryLocation(
  where: QuestionnaireLocation | ConfigurationLocation,
): PrimaryLocation {
  if (where.kind === 'config') {
    const { file, pointer } = where.configLocation;
    return { kind: 'config', file, pointer };
  }
  if (where.sourceLocation.status === 'mapped') {
    return { kind: 'source', location: where.sourceLocation.location };
  }
  const { file, pointer, resource } = where.jsonLocation;
  return { kind: 'compiled', file, pointer, resource, reason: where.sourceLocation.reason };
}

export function displayPointer(pointer: string): string {
  return pointer === '' ? '(file root)' : pointer;
}

export function resourceLabel(resource: ResourceIdentity): string {
  const name =
    resource.id === undefined
      ? `${resource.resourceType} without id`
      : `${resource.resourceType}/${resource.id}`;
  return resource.pointer === '' ? name : `${name} at ${resource.pointer}`;
}

// A related location of a finding: its FSH line when mapped, otherwise its JSON Pointer in the
// finding's file, or its config entry.
function relatedPlace(related: RelatedLocation): string {
  if (related.kind === 'config') {
    return `${related.configLocation.file} ${displayPointer(related.configLocation.pointer)}`;
  }
  if (related.sourceLocation.status === 'unmapped') {
    return displayPointer(related.jsonLocation.pointer);
  }
  const { file, line, column } = related.sourceLocation.location;
  return `${file}:${String(line)}:${String(column)}`;
}

// The lines that follow a finding's message and excerpt, unindented: where an unmapped or config
// finding is, why it has no FSH line, its related locations, its note and its help.
export function findingDetailLines(finding: Finding): string[] {
  const lines: string[] = [];
  const primary = primaryLocation(finding);
  if (primary.kind === 'config') {
    lines.push(`location: ${displayPointer(primary.pointer)}`);
  } else if (primary.kind === 'compiled') {
    lines.push(
      `location: compiled JSON; ${resourceLabel(primary.resource)}; ${displayPointer(primary.pointer)}`,
    );
    lines.push(`note: FSH line not found, ${unmappedReasons[primary.reason]}`);
  }
  for (const related of finding.relatedLocations ?? []) {
    const message = related.message === undefined ? '' : `: ${related.message}`;
    lines.push(`related: ${relatedPlace(related)}${message}`);
  }
  if (finding.note !== undefined) lines.push(`note: ${finding.note}`);
  if (finding.help !== undefined) lines.push(`help: ${finding.help}`);
  return lines;
}
