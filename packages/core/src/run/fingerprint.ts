import { createHash } from 'node:crypto';
import type { SuppressionEntry } from '../config/types.js';
import type { ResourceIdentity } from '../report/types.js';
import type { SiteIdentity } from '../analysis/walker.js';

function digest(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

// Rule, file, resource and the most stable site identity; never a line number, so moving FSH
// lines or inserting items before a site keeps the fingerprint.
export function questionnaireFingerprint({
  ruleId,
  file,
  resource,
  site,
}: {
  ruleId: string;
  file: string;
  resource: ResourceIdentity;
  site: SiteIdentity;
}): string {
  return digest([
    ruleId,
    file,
    resource.resourceType,
    resource.id ?? null,
    resource.pointer,
    site.linkId ?? null,
    site.extensionUrls,
    site.declarationName ?? null,
    site.tail,
  ]);
}

// A config finding's identity is its rule and the suppression's selector, not its array index,
// so reordering the suppress array keeps it.
export function configFingerprint(ruleId: string, entry: SuppressionEntry): string {
  return digest([
    ruleId,
    entry.rule,
    entry.file,
    entry.linkId ?? null,
    entry.extensionUrl ?? null,
    entry.declaration ?? null,
    entry.resource ?? null,
    entry.pointer ?? null,
  ]);
}
