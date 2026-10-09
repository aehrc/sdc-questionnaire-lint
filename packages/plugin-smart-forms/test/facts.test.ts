import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Evidence, sourceBase } from '../src/facts/evidence.js';
import { languageFacts } from '../src/facts/languages.js';
import { prerequisites } from '../src/facts/prerequisites.js';
import { components, type FactTable } from '../src/facts/versions.js';
import smartForms from '../src/index.js';

const tables: FactTable<readonly { evidence: readonly Evidence[] }[]>[] = [
  languageFacts,
  prerequisites,
];

function* allEvidence(): Generator<Evidence> {
  for (const table of tables) {
    for (const component of components) {
      for (const facts of Object.values(table[component])) {
        for (const fact of facts) yield* fact.evidence;
      }
    }
  }
}

describe('runtime facts', () => {
  it.each(components)('cover every verified %s version', (component) => {
    const verified = smartForms.compat?.verified[component] ?? [];
    expect(verified.length).toBeGreaterThan(0);
    for (const version of verified) {
      expect(Object.keys(languageFacts[component])).toContain(version);
      expect(Object.keys(prerequisites[component])).toContain(version);
    }
  });

  it('give every fact evidence', () => {
    for (const table of tables) {
      for (const component of components) {
        for (const facts of Object.values(table[component])) {
          for (const fact of facts) expect(fact.evidence.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('cite the source at the release commit', () => {
    expect(sourceBase).toBe(
      'https://github.com/aehrc/smart-forms/blob/f846e2d8fbb97049360e58cbaf6b06bae0a78cb3/',
    );
    for (const evidence of allEvidence()) {
      if (evidence.kind === 'source-only') {
        expect(evidence.permalink).toMatch(
          new RegExp(`^${sourceBase.replaceAll('.', '\\.')}packages/[^#]+\\.tsx?#L\\d+-L\\d+$`),
        );
      }
    }
  });

  it('are all source-only until the populate harness lands in P2', () => {
    for (const evidence of allEvidence()) expect(evidence.kind).toBe('source-only');
  });

  it('name a test file that exists for every reproduced fact', () => {
    for (const evidence of allEvidence()) {
      if (evidence.kind === 'reproduced') {
        expect(existsSync(new URL(`../${evidence.test}`, import.meta.url))).toBe(true);
      }
    }
  });
});
