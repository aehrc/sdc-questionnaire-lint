import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Evidence, sourceBase } from '../src/facts/evidence.js';
import { languageFacts } from '../src/facts/languages.js';
import { unsuppliedNames } from '../src/facts/names.js';
import { prerequisites } from '../src/facts/prerequisites.js';
import { type Component, components, type FactTable } from '../src/facts/versions.js';
import smartForms from '../src/index.js';

const tables: FactTable<readonly { evidence: readonly Evidence[] }[]>[] = [
  languageFacts,
  prerequisites,
  unsuppliedNames,
];

function* factsOf(component: Component): Generator<{ evidence: readonly Evidence[] }> {
  for (const table of tables) {
    for (const facts of Object.values(table[component])) yield* facts;
  }
}

function* allEvidence(): Generator<Evidence> {
  for (const component of components) {
    for (const fact of factsOf(component)) yield* fact.evidence;
  }
}

describe('runtime facts', () => {
  it.each(components)('cover every verified %s version', (component) => {
    const verified = smartForms.compat?.verified[component] ?? [];
    expect(verified.length).toBeGreaterThan(0);
    for (const version of verified) {
      for (const table of tables) expect(Object.keys(table[component])).toContain(version);
    }
  });

  it('give every fact evidence', () => {
    for (const component of components) {
      for (const fact of factsOf(component)) expect(fact.evidence.length).toBeGreaterThan(0);
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

  it('every populate fact has reproduced evidence', () => {
    for (const fact of factsOf('populate')) {
      expect(fact.evidence.map(({ kind }) => kind)).toContain('reproduced');
    }
  });

  it('every renderer fact is source-only until P9', () => {
    for (const fact of factsOf('renderer')) {
      for (const evidence of fact.evidence) expect(evidence.kind).toBe('source-only');
    }
  });

  it('name a test that exists for every reproduced fact', () => {
    for (const evidence of allEvidence()) {
      if (evidence.kind !== 'reproduced') continue;
      const file = new URL(`../${evidence.test}`, import.meta.url);
      expect(existsSync(file)).toBe(true);
      // The title's last segment, as the it() call writes it.
      const title = evidence.name.split(' > ').at(-1) ?? '';
      expect(readFileSync(file, 'utf8')).toContain(`'${title}'`);
    }
  });
});
