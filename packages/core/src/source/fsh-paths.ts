/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { FshDefinition, FshRule } from './fsh-document.js';

// The full path of each rule of an Instance, as SUSHI 3.20.1 computes it: the context of indented
// rules (FSHImporter.prependPathContext), then numbers for soft indices (PathUtils.resolveSoftIndexing,
// without the manualSliceOrdering option). SUSHI expands insert rules before it resolves soft
// indices, so in a definition with an insert rule the indices after it may differ from SUSHI's.

// One part of a path, as SUSHI's parseFSHPath splits it: extension[variable][0] has the base
// extension and the brackets variable and 0.
export interface PathPart {
  base: string;
  brackets: string[];
  // When this part has brackets: every slice name in brackets so far, this part's included.
  slices: string[];
}

export type PathRule = Extract<FshRule, { kind: 'assignment' | 'path' }>;

export interface ResolvedRule {
  readonly rule: PathRule;
  readonly path: string;
}

const indentWidth = 2;
const indexPattern = /^[0-9]+$/;

// A period inside brackets, as in an extension URL, does not split.
function splitOnPathPeriods(path: string): string[] {
  return path.split(/\.(?![^[]*\])/g);
}

export function parsePath(path: string): PathPart[] {
  const seenSlices: string[] = [];
  return (path === '.' ? [path] : splitOnPathPeriods(path)).map((written) => {
    const base = /^[^[]+(\[x\])?/.exec(written)?.[0] ?? '';
    const brackets = [...written.slice(base.length).matchAll(/\[(?:[^[\]]|\[[^[\]]*\])*\]/g)].map(
      ([bracket]) => bracket.slice(1, -1),
    );
    seenSlices.push(
      ...brackets.filter(
        (bracket) => !indexPattern.test(bracket) && bracket !== '+' && bracket !== '=',
      ),
    );
    return { base, brackets, slices: brackets.length > 0 ? [...seenSlices] : [] };
  });
}

export function assemblePath(parts: readonly PathPart[]): string {
  return parts
    .map(({ base, brackets }) => base + brackets.map((bracket) => `[${bracket}]`).join(''))
    .join('.');
}

// Puts each rule's path under the path of the rule it is indented under. A rule indented under
// nothing, or by a number of spaces SUSHI rejects, keeps its own path.
function applyContext(rules: readonly FshRule[]): { rule: PathRule; path: string[] }[] {
  const placed: { rule: PathRule; path: string[] }[] = [];
  // contexts[n] is the full path of the latest rule indented n levels.
  let contexts: string[][] = [];
  for (const rule of rules) {
    // Only assignment, path and insert rules are Instance rules.
    if (rule.kind === 'other') continue;
    const own =
      rule.path === undefined
        ? []
        : rule.path === '.'
          ? ['.']
          : splitOnPathPeriods(rule.path).filter((part) => part !== '');
    const level = rule.indent / indentWidth;
    const placeable =
      (rule.indent === 0 || contexts.length > 0) &&
      Number.isInteger(level) &&
      level <= contexts.length;
    let path = own;
    if (placeable && level === 0) {
      contexts = [own];
    } else if (placeable && own.join('.') !== '.') {
      const parent = contexts[level - 1] ?? [];
      if (parent.length > 0) {
        path = [...parent, ...own];
        contexts = [...contexts.slice(0, level), path];
      }
    }
    // Once a rule has used the contexts, their [+] becomes [=], so the next rule under the same
    // parent does not move to another element.
    contexts = contexts.map((context) => context.map((part) => part.replaceAll('[+]', '[=]')));
    if (rule.kind !== 'insert') placed.push({ rule, path });
  }
  return placed;
}

// Replaces [+] and [=] with numbers. Each path prefix, element and set of slice names counts on
// its own: [+] moves to its next index, [=] repeats its last one, and a number sets it.
function resolveSoftIndices(paths: readonly string[][]): string[] {
  const lastIndex = new Map<string, number>();
  return paths.map((path) => {
    const parts = parsePath(path.join('.'));
    parts.forEach((part, position) => {
      const key = `${assemblePath(parts.slice(0, position))}.${part.base}|${part.slices.join('|')}`;
      const last = lastIndex.get(key);
      if (last === undefined) {
        const numeric = part.brackets.find((bracket) => indexPattern.test(bracket));
        lastIndex.set(key, numeric === undefined ? 0 : Number(numeric));
        // A sequence starts at 0; SUSHI reports an error for one that starts with [=].
        const soft = part.brackets.includes('+')
          ? part.brackets.indexOf('+')
          : part.brackets.indexOf('=');
        if (numeric === undefined && soft !== -1) part.brackets[soft] = '0';
        return;
      }
      let index = last;
      part.brackets = part.brackets.map((bracket) => {
        if (bracket === '+') index += 1;
        else if (indexPattern.test(bracket)) index = Number(bracket);
        else if (bracket !== '=') return bracket;
        return String(index);
      });
      lastIndex.set(key, index);
    });
    return assemblePath(parts);
  });
}

// The assignment and path rules of a definition, in order, each with its full path.
export function resolvePaths(definition: FshDefinition): ResolvedRule[] {
  const placed = applyContext(definition.rules);
  const paths = resolveSoftIndices(placed.map(({ path }) => path));
  return placed.map(({ rule }, position) => ({ rule, path: paths[position] ?? '' }));
}
