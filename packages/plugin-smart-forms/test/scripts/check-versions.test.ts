/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import { checkVersions } from '../../scripts/check-versions.js';

const repository = 'owner/repo';
const issuesUrl = 'https://api.github.com/repos/owner/repo/issues';
const pageUrl = (page: number) => `${issuesUrl}?state=all&per_page=100&page=${String(page)}`;

interface Recorded {
  method: string;
  url: string;
  body?: unknown;
}

interface FakeIssue {
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string | null;
  pull_request?: object;
}

// The npm and GitHub endpoints checkVersions calls, answered from the given state. Every request
// is recorded; a request to any other URL fails the test. override answers a request in place of
// the fake when it returns a response.
function fakeNetwork(state: {
  latest: Record<string, string>;
  issues?: FakeIssue[][];
  // The release commit npm records for package@version; sha-<version> when not given.
  gitHeads?: Record<string, string>;
  override?: (method: string, url: string) => Response | undefined;
}) {
  const requests: Recorded[] = [];
  const pages = state.issues ?? [[]];
  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, url, ...(body === undefined ? {} : { body }) });
    const overridden = state.override?.(method, url);
    if (overridden !== undefined) return Promise.resolve(overridden);
    const tags = /^https:\/\/registry\.npmjs\.org\/-\/package\/(.+)\/dist-tags$/.exec(url);
    if (method === 'GET' && tags?.[1] !== undefined && tags[1] in state.latest) {
      return Promise.resolve(Response.json({ latest: state.latest[tags[1]] }));
    }
    const version = /^https:\/\/registry\.npmjs\.org\/(@aehrc\/[^/]+)\/([^/]+)$/.exec(url);
    if (method === 'GET' && version?.[1] !== undefined && version[2] !== undefined) {
      const id = `${version[1]}@${version[2]}`;
      return Promise.resolve(
        Response.json({ gitHead: state.gitHeads?.[id] ?? `sha-${version[2]}` }),
      );
    }
    const page = /[?&]page=(\d+)$/.exec(url);
    if (method === 'GET' && page?.[1] !== undefined && url === pageUrl(Number(page[1]))) {
      const index = Number(page[1]) - 1;
      const next = index + 1 < pages.length ? pageUrl(index + 2) : undefined;
      return Promise.resolve(
        Response.json(pages[index] ?? [], {
          headers: next === undefined ? {} : { link: `<${next}>; rel="next"` },
        }),
      );
    }
    if (method === 'POST' && url === issuesUrl) {
      return Promise.resolve(
        Response.json(
          { number: 100, html_url: 'https://github.com/owner/repo/issues/100' },
          { status: 201 },
        ),
      );
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return { fetch, requests, created: () => requests.filter((r) => r.method === 'POST') };
}

function issueWithMarker(number: number, state: 'open' | 'closed', id: string): FakeIssue {
  return { number, state, title: 'Tracked', body: `Text\n<!-- smart-forms-version: ${id} -->\n` };
}

function plugin(verified: Record<string, string[]>): unknown {
  return { default: { compat: { verified, required: ['renderer', 'populate'] } } };
}

const verified = { renderer: ['1.4.0'], populate: ['4.7.1'], 'template-extract': ['1.0.15'] };
const allVerified = {
  '@aehrc/smart-forms-renderer': '1.4.0',
  '@aehrc/sdc-populate': '4.7.1',
  '@aehrc/sdc-template-extract': '1.0.15',
};
const rendererBehind = { ...allVerified, '@aehrc/smart-forms-renderer': '1.5.0' };

async function run(
  network: ReturnType<typeof fakeNetwork>,
  options: { dryRun?: boolean; plugin?: unknown } = {},
) {
  const lines: string[] = [];
  await checkVersions({
    plugin: options.plugin ?? plugin(verified),
    fetch: network.fetch,
    token: 'token',
    repository,
    dryRun: options.dryRun ?? false,
    log: (line) => lines.push(line),
  });
  return lines;
}

describe('checkVersions', () => {
  it('opens an issue for a latest version that is not verified', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
    });
    await run(network);
    const created = network.created();
    expect(created).toHaveLength(1);
    const issue = created[0]?.body as { title: string; body: string };
    expect(issue.title).toBe('Smart Forms plugin: verify renderer 1.5.0');
    expect(issue.body).toContain('<!-- smart-forms-version: renderer@1.5.0 -->');
    expect(issue.body).toContain(
      '| renderer | 1.4.0 | 1.5.0 | [changes](https://github.com/aehrc/smart-forms/compare/sha-1.4.0...sha-1.5.0) |',
    );
    expect(issue.body).toContain(
      'https://github.com/owner/repo/blob/main/docs/plugin-smart-forms/new-release.md',
    );
  });

  it('opens one issue for the versions of one Smart Forms release', async () => {
    const network = fakeNetwork({
      latest: { ...rendererBehind, '@aehrc/sdc-populate': '4.7.2' },
      gitHeads: { '@aehrc/smart-forms-renderer@1.5.0': 'r', '@aehrc/sdc-populate@4.7.2': 'r' },
    });
    await run(network);
    const created = network
      .created()
      .map((request) => request.body as { title: string; body: string });
    expect(created.map(({ title }) => title)).toEqual([
      'Smart Forms plugin: verify renderer 1.5.0 and populate 4.7.2',
    ]);
    expect(created[0]?.body).toContain('<!-- smart-forms-version: renderer@1.5.0 -->');
    expect(created[0]?.body).toContain('<!-- smart-forms-version: populate@4.7.2 -->');
  });

  it('opens one issue per release commit', async () => {
    const network = fakeNetwork({
      latest: { ...rendererBehind, '@aehrc/sdc-populate': '4.7.2' },
    });
    await run(network);
    expect(network.created().map((request) => (request.body as { title: string }).title)).toEqual([
      'Smart Forms plugin: verify renderer 1.5.0',
      'Smart Forms plugin: verify populate 4.7.2',
    ]);
  });

  it('leaves a version another issue tracks out of the release issue', async () => {
    const network = fakeNetwork({
      latest: { ...rendererBehind, '@aehrc/sdc-populate': '4.7.2' },
      gitHeads: { '@aehrc/smart-forms-renderer@1.5.0': 'r', '@aehrc/sdc-populate@4.7.2': 'r' },
      issues: [[issueWithMarker(7, 'open', 'populate@4.7.2')]],
    });
    await run(network);
    const created = network
      .created()
      .map((request) => request.body as { title: string; body: string });
    expect(created.map(({ title }) => title)).toEqual([
      'Smart Forms plugin: verify renderer 1.5.0',
    ]);
    expect(created[0]?.body).not.toContain('populate@4.7.2');
  });

  it('opens no issue when every latest version is verified', async () => {
    const network = fakeNetwork({ latest: allVerified });
    await run(network);
    expect(network.created()).toEqual([]);
  });

  it('opens no issue when an open issue has the version marker', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
      issues: [[issueWithMarker(7, 'open', 'renderer@1.5.0')]],
    });
    await run(network);
    expect(network.created()).toEqual([]);
  });

  it('opens no issue, and reopens none, when a closed issue has the version marker', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
      issues: [[issueWithMarker(7, 'closed', 'renderer@1.5.0')]],
    });
    await run(network);
    expect(network.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  });

  it('finds the version marker on a later page of issues', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
      issues: [
        [issueWithMarker(9, 'open', 'populate@4.7.2')],
        [issueWithMarker(7, 'closed', 'renderer@1.5.0')],
      ],
    });
    await run(network);
    expect(network.created()).toEqual([]);
  });

  it('opens an issue when only a pull request has the version marker', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
      issues: [[{ ...issueWithMarker(8, 'open', 'renderer@1.5.0'), pull_request: {} }]],
    });
    await run(network);
    expect(network.created()).toHaveLength(1);
  });

  it('matches the marker exactly, not a version that starts with it', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
      issues: [[issueWithMarker(7, 'open', 'renderer@1.5.0-beta.1')]],
    });
    await run(network);
    expect(network.created()).toHaveLength(1);
  });

  it('in a dry run, lists the issue it would open and opens none', async () => {
    const network = fakeNetwork({
      latest: rendererBehind,
      issues: [[issueWithMarker(7, 'open', 'populate@4.7.2')]],
    });
    const lines = await run(network, { dryRun: true });
    expect(network.created()).toEqual([]);
    expect(lines).toContain('Dry run: would open "Smart Forms plugin: verify renderer 1.5.0".');
  });

  it('reports each component as verified, already tracked or opened', async () => {
    const network = fakeNetwork({
      latest: {
        '@aehrc/smart-forms-renderer': '1.5.0',
        '@aehrc/sdc-populate': '4.7.2',
        '@aehrc/sdc-template-extract': '1.0.15',
      },
      issues: [[issueWithMarker(7, 'open', 'populate@4.7.2')]],
    });
    const lines = await run(network);
    expect(lines).toEqual([
      'renderer: latest 1.5.0 is not verified (verified: 1.4.0).',
      'populate: latest 4.7.2 is not verified (verified: 4.7.1). Already tracked by #7.',
      'template-extract: latest 1.0.15 is verified.',
      'Opened #100 for renderer 1.5.0: https://github.com/owner/repo/issues/100',
    ]);
  });

  describe('fails, and opens no issue,', () => {
    const registry = (method: string, url: string) =>
      method === 'GET' && url.startsWith('https://registry.npmjs.org/');
    const list = (method: string, url: string) => method === 'GET' && url.startsWith(issuesUrl);

    const error = (status: number) => Response.json({ message: 'Error' }, { status });

    it.each([
      ['the registry answers with an error', registry, error(404)],
      ['the registry has no latest version', registry, Response.json({ next: '2.0.0' })],
      [
        'the registry has no release commit for a version',
        (method: string, url: string) => registry(method, url) && !url.includes('/-/package/'),
        Response.json({ version: '1.5.0' }),
      ],
      ['listing issues answers with an error', list, error(401)],
      ['listing issues answers with something other than issues', list, Response.json({})],
      ['an issue has no number', list, Response.json([{ body: 'text' }])],
    ])('when %s', async (_name, matches, response) => {
      const network = fakeNetwork({
        latest: rendererBehind,
        override: (method, url) => (matches(method, url) ? response.clone() : undefined),
      });
      await expect(run(network)).rejects.toThrow();
      expect(network.created()).toEqual([]);
    });

    it('when creating the issue answers with an error', async () => {
      const network = fakeNetwork({
        latest: rendererBehind,
        override: (method) => (method === 'POST' ? error(403) : undefined),
      });
      await expect(run(network)).rejects.toThrow();
    });

    it.each([
      ['has no default export', {}],
      ['has no compat.verified', { default: { compat: {} } }],
      [
        'verifies a version that is not a string',
        { default: { compat: { verified: { renderer: [1] } } } },
      ],
      ['verifies an unknown component', plugin({ ...verified, editor: ['1.0.0'] })],
      [
        'verifies a component named like an object property',
        plugin({ ...verified, constructor: ['1.0.0'] }),
      ],
      ['has no versions for a component', plugin({ renderer: ['1.4.0'], populate: ['4.7.1'] })],
      ['verifies no version of a component', plugin({ ...verified, renderer: [] })],
    ])('when the plugin %s', async (_name, module) => {
      const network = fakeNetwork({ latest: rendererBehind });
      await expect(run(network, { plugin: module })).rejects.toThrow(/compat\.verified|component/);
      expect(network.requests).toEqual([]);
    });
  });
});
