import type { ExpressionSite } from '../plugins/types.js';
import type { SourceMapResult } from '../report/types.js';

// Maps a finding's site to its FSH source (core-plan §7).
export interface SourceMap {
  locate(site: ExpressionSite): SourceMapResult;
}

export interface SourceMapOptions {
  // Available FSH directories, and SUSHI's definition index, which may be missing or unusable.
  directories: readonly string[];
  sushiIndex: string;
}

// Stub until the source mapper exists: every finding keeps its compiled JSON location.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the mapper will use the options.
export function createSourceMap(options: SourceMapOptions): SourceMap {
  return { locate: () => ({ status: 'unmapped', reason: 'source-unavailable' }) };
}
