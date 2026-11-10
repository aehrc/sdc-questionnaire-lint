/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

// Opens an issue for each Smart Forms component whose latest version on npm is not in the
// plugin's compat.verified, unless an issue for that version exists, open or closed. Run by
// .github/workflows/smart-forms-versions.yml after npm run build, from the repository root:
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo [DRY_RUN=true] \
//     node packages/plugin-smart-forms/scripts/check-versions.ts
// DRY_RUN=true lists the issues it would open and opens none. Any failed request or unexpected
// answer fails the run before an issue is opened.
import { fileURLToPath } from 'node:url';

type Component = 'renderer' | 'populate' | 'template-extract';

// The npm package of each component.
const packages: Record<Component, string> = {
  renderer: '@aehrc/smart-forms-renderer',
  populate: '@aehrc/sdc-populate',
  'template-extract': '@aehrc/sdc-template-extract',
};

export interface CheckOptions {
  // The imported plugin build, whose default export has compat.verified.
  plugin: unknown;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  token: string;
  // owner/repo, as GITHUB_REPOSITORY gives it.
  repository: string;
  dryRun: boolean;
  log: (line: string) => void;
}

interface Issue {
  title: string;
  body: string;
}

interface ListedIssue {
  number: number;
  body: string;
}

const githubApi = 'https://api.github.com';

const components = Object.keys(packages) as Component[];

export async function checkVersions(options: CheckOptions): Promise<void> {
  const verified = readVerified(options.plugin);
  const latest = new Map<Component, string>();
  for (const component of components) {
    latest.set(component, await latestVersion(options, component));
  }
  const issues = await listIssues(options);
  for (const component of components) {
    const versions = verified[component];
    const version = latest.get(component) ?? '';
    if (versions.includes(version)) {
      options.log(`${component}: latest ${version} is verified.`);
      continue;
    }
    const status = `${component}: latest ${version} is not verified (verified: ${versions.join(', ')}).`;
    const tracked = issues.find((issue) => issue.body.includes(marker(component, version)));
    if (tracked !== undefined) {
      options.log(`${status} Already tracked by #${String(tracked.number)}.`);
      continue;
    }
    const issue = issueFor(component, version, versions);
    if (options.dryRun) {
      options.log(`${status} Dry run: would open "${issue.title}".`);
      continue;
    }
    const created = await createIssue(options, issue);
    options.log(`${status} Opened #${String(created.number)}: ${created.url}`);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// compat.verified of the plugin's default export, which must list versions for exactly the
// components npm packages are known for.
function readVerified(plugin: unknown): Record<Component, string[]> {
  const compat = isRecord(plugin) && isRecord(plugin.default) ? plugin.default.compat : undefined;
  const verified = isRecord(compat) ? compat.verified : undefined;
  if (!isRecord(verified)) throw new Error('The plugin has no compat.verified.');
  for (const component of Object.keys(verified)) {
    if (!Object.hasOwn(packages, component)) {
      throw new Error(`No npm package is known for component ${component}.`);
    }
  }
  const versionsOf = (component: Component): string[] => {
    const versions = verified[component];
    if (!Array.isArray(versions) || !versions.every((version) => typeof version === 'string')) {
      throw new Error(`compat.verified.${component} is not a list of versions.`);
    }
    return versions;
  };
  return {
    renderer: versionsOf('renderer'),
    populate: versionsOf('populate'),
    'template-extract': versionsOf('template-extract'),
  };
}

// The JSON body of a request that must succeed, and the response for its headers.
async function request(
  options: CheckOptions,
  url: string,
  init: RequestInit = {},
): Promise<{ body: unknown; response: Response }> {
  const response = await options.fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${url} answered ${String(response.status)}: ${await response.text()}`,
    );
  }
  return { body: await response.json(), response };
}

const githubHeaders = (options: CheckOptions): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${options.token}`,
  'x-github-api-version': '2022-11-28',
});

// The latest dist-tag only: a version released and superseded between two runs is not seen.
async function latestVersion(options: CheckOptions, component: Component): Promise<string> {
  const name = packages[component];
  const { body } = await request(options, `https://registry.npmjs.org/-/package/${name}/dist-tags`);
  if (!isRecord(body) || typeof body.latest !== 'string') {
    throw new Error(`npm has no latest version of ${name}.`);
  }
  return body.latest;
}

// The repository's issues, open and closed. Through the issues endpoint, not search, which can
// miss an issue opened moments before. The endpoint lists pull requests too, which are skipped, so
// a marker quoted in a pull request doesn't count.
async function listIssues(options: CheckOptions): Promise<ListedIssue[]> {
  const issues: ListedIssue[] = [];
  let url: string | undefined =
    `${githubApi}/repos/${options.repository}/issues?state=all&per_page=100&page=1`;
  while (url !== undefined) {
    const { body, response } = await request(options, url, { headers: githubHeaders(options) });
    if (!Array.isArray(body)) throw new Error(`GET ${url} did not answer with a list of issues.`);
    for (const issue of body) {
      if (!isRecord(issue) || typeof issue.number !== 'number') {
        throw new Error(`GET ${url} answered with an issue without a number.`);
      }
      if (issue.pull_request !== undefined) continue;
      issues.push({
        number: issue.number,
        body: typeof issue.body === 'string' ? issue.body : '',
      });
    }
    url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1];
  }
  return issues;
}

// The hidden line that identifies the issue for one component version.
function marker(component: Component, version: string): string {
  return `<!-- smart-forms-version: ${component}@${version} -->`;
}

function issueFor(component: Component, latest: string, versions: readonly string[]): Issue {
  const name = packages[component];
  const verifiedList = versions.join(', ');
  const override =
    component === 'populate' ? ' Update the `fhirclient` override first (see AGENTS.md).' : '';
  return {
    title: `Smart Forms plugin: verify ${component}@${latest}`,
    body: `${marker(component, latest)}
The Smart Forms plugin on \`main\` verifies ${component} ${verifiedList} (\`compat.verified\`). The latest ${component} on npm is ${latest} (\`${name}\`).

A config that names ${component} ${latest} fails with \`CONFIG_INVALID\`. So a project whose forms run on it has to pin \`compat\` to an older version, and its reports' \`run.compat\` names a version it doesn't run.

## Proposed

- [ ] Run the reproduction tests (\`packages/plugin-smart-forms/test/reproduction/\`) against \`${name}\` ${latest}, bumping the plugin's dev dependency where it has one.${override}
- [ ] Re-check the \`source-only\` ${component} facts against ${latest}. Their permalinks cite the source the plugin was researched on.
- [ ] Add ${latest} to \`compat.verified\`, oldest to newest. Update the README's "This release verifies …" sentence and the docs, then release the plugin.
- [ ] Decide whether ${verifiedList} stay${versions.length === 1 ? 's' : ''} verified.

Opened by \`.github/workflows/smart-forms-versions.yml\`, which finds this issue by the hidden marker on the first line. Closing it, done or not, stops the job from opening another for ${component} ${latest}.
`,
  };
}

async function createIssue(
  options: CheckOptions,
  issue: Issue,
): Promise<{ number: number; url: string }> {
  const url = `${githubApi}/repos/${options.repository}/issues`;
  const { body } = await request(options, url, {
    method: 'POST',
    headers: { ...githubHeaders(options), 'content-type': 'application/json' },
    body: JSON.stringify(issue),
  });
  if (!isRecord(body) || typeof body.number !== 'number' || typeof body.html_url !== 'string') {
    throw new Error(`POST ${url} did not answer with the created issue.`);
  }
  return { number: body.number, url: body.html_url };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set.`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // DRY_RUN is empty on a scheduled run, which has no inputs.
  const dryRun = process.env.DRY_RUN ?? '';
  if (!['', 'true', 'false'].includes(dryRun)) {
    throw new Error(`DRY_RUN must be true or false, not ${dryRun}.`);
  }
  await checkVersions({
    plugin: await import(new URL('../dist/index.js', import.meta.url).href),
    fetch,
    token: requiredEnvironment('GITHUB_TOKEN'),
    repository: requiredEnvironment('GITHUB_REPOSITORY'),
    dryRun: dryRun === 'true',
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
  });
}
