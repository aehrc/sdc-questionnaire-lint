/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { compareStrings } from '../compare.js';
import type { Finding } from './types.js';

function displayedFile(finding: Finding): string {
  if (finding.kind === 'config') return finding.configLocation.file;
  const source = finding.sourceLocation;
  return source.status === 'mapped' ? source.location.file : finding.jsonLocation.file;
}

function position(finding: Finding): { line: number; column: number } | undefined {
  if (finding.kind === 'config' || finding.sourceLocation.status !== 'mapped') return undefined;
  return finding.sourceLocation.location;
}

// Known positions sort before unknown ones.
function comparePositions(a: Finding, b: Finding): number {
  const left = position(a);
  const right = position(b);
  if (left === undefined || right === undefined) {
    return (left === undefined ? 1 : 0) - (right === undefined ? 1 : 0);
  }
  return left.line - right.line || left.column - right.column;
}

function resourcePointer(finding: Finding): string {
  return finding.kind === 'questionnaire' ? finding.jsonLocation.resource.pointer : '';
}

function sitePointer(finding: Finding): string {
  return finding.kind === 'questionnaire'
    ? finding.jsonLocation.pointer
    : finding.configLocation.pointer;
}

// The one finding order for every reporter (cli.md § Streams and exit codes).
export function compareFindings(a: Finding, b: Finding): number {
  return (
    compareStrings(displayedFile(a), displayedFile(b)) ||
    comparePositions(a, b) ||
    compareStrings(a.ruleId, b.ruleId) ||
    compareStrings(resourcePointer(a), resourcePointer(b)) ||
    compareStrings(sitePointer(a), sitePointer(b)) ||
    compareStrings(a.fingerprint, b.fingerprint)
  );
}
