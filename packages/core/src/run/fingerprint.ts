import { createHash } from 'node:crypto';
import type { ExpressionSite, QuestionnaireDocument } from '../analysis/expression-site.js';
import type { SuppressionEntry } from '../config/types.js';
import type { ResourceIdentity } from '../report/types.js';

// A site's identity from its own fields, without array indexes above its item where the item has
// a linkId. Sites that repeat one catalogued location share a base key.
function baseKey(document: QuestionnaireDocument, site: ExpressionSite): string {
  const anchor = site.item?.linkId ?? site.item?.pointer ?? '';
  const { location } = site;
  if (location !== undefined) {
    return JSON.stringify([
      anchor,
      location.url,
      location.subExtension ?? null,
      site.element ?? null,
      site.declares ? (site.name ?? null) : null,
    ]);
  }
  const base = site.item?.pointer ?? document.resourcePointer;
  return JSON.stringify([anchor, site.pointer.slice(base.length)]);
}

// One stable key per site of a document; computed once per document, in document order. The n-th
// site with the same base key gets #n, so repeats stay distinct; the first gets nothing. Inserting
// another site with the same base key before a site therefore changes its key. A fragment follows
// its query, and its key is the query's plus {{n}} for the n-th fragment; fragments are not
// repeats, so a query's key does not depend on them.
export function siteKeys(
  document: QuestionnaireDocument,
  sites: readonly ExpressionSite[],
): Map<ExpressionSite, string> {
  const occurrences = new Map<string, number>();
  const keys = new Map<ExpressionSite, string>();
  let query: { key: string; fragments: number } | undefined;
  for (const site of sites) {
    if (site.carrier === 'fragment') {
      if (query === undefined)
        throw new Error(`A fragment has no query before it: ${site.pointer}`);
      query.fragments += 1;
      keys.set(site, `${query.key}{{${String(query.fragments)}}}`);
      continue;
    }
    const base = baseKey(document, site);
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    const key = occurrence === 1 ? base : `${base}#${String(occurrence)}`;
    keys.set(site, key);
    query = { key, fragments: 0 };
  }
  return keys;
}

function sha256(identity: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

// Rule, file, resource and the site key; never a line number or an array index above the item.
export function questionnaireFingerprint(parts: {
  ruleId: string;
  file: string;
  resource: ResourceIdentity;
  key: string;
}): string {
  const { ruleId, file, resource, key } = parts;
  const identity = [
    ruleId,
    file,
    resource.resourceType,
    resource.id ?? null,
    resource.pointer,
    key,
  ];
  return sha256(identity);
}

// A finding about a suppression entry: the reporting rule, the suppressed rule and the selectors.
// Never the reason or the entry's index in suppress (report-format.md § Findings and locations).
export function configFingerprint(ruleId: string, entry: SuppressionEntry): string {
  return sha256([
    ruleId,
    entry.rule,
    entry.file,
    entry.linkId ?? null,
    entry.extensionUrl ?? null,
    entry.name ?? null,
    entry.resource ?? null,
    entry.pointer ?? null,
  ]);
}
