import { cpSync } from 'node:fs';
import { extname, join, posix } from 'node:path';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { fsh } from './fsh.js';
import { repositoryUrl, ruleLibrary } from './rules.js';

const rewrites: Record<string, string> = { 'README.md': 'index.md' };

// Whether a repository path is part of the site: a page, or a schema or example report copied by
// buildEnd. Keep it in step with srcExclude.
function onSite(path: string): boolean {
  return (
    path === 'README.md' ||
    path === 'GLOSSARY.md' ||
    (path.startsWith('docs/') &&
      !path.startsWith('docs/plans/') &&
      !path.startsWith('docs/.vitepress/'))
  );
}

// The docs link to each other by repository path, as GitHub renders them. On the site, a link to a
// rewritten page follows the rewrite, and a link to a file the site leaves out, such as source
// code or AGENTS.md, points at that file on GitHub. Returns undefined for a link that needs no
// change.
function siteLink(href: string, pagePath: string): string | undefined {
  if (/^([a-z]+:|\/|#)/i.test(href)) return undefined;
  const hashIndex = href.indexOf('#');
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const directory = posix.dirname(pagePath);
  const target = posix.normalize(posix.join(directory, path));
  if (target.startsWith('../')) return undefined;
  const rewritten = rewrites[target];
  if (rewritten !== undefined) return posix.relative(directory, rewritten) + hash;
  if (onSite(target)) return undefined;
  return repositoryUrl(target) + hash;
}

// Heading ids as GitHub makes them, so that `file.md#heading` links work in both places. VitePress
// would drop underscores, collapse hyphens and prefix `_` to a leading digit.
function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replaceAll(' ', '-');
}

// The site is built from the repository root, so README.md, GLOSSARY.md and docs/ keep their
// GitHub-relative links. Everything else that holds Markdown is excluded below; add new
// non-documentation Markdown locations here, or they become pages.
export default withMermaid(
  defineConfig({
    title: 'sdc-questionnaire-lint',
    description:
      'Static checks for the FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires',
    srcDir: '..',
    srcExclude: [
      'AGENTS.md',
      'CLAUDE.md',
      'PLAN-*.md',
      'plans/**',
      'docs/plans/**',
      'packages/**',
      'corpus/**',
      'demo/**',
      'coverage/**',
    ],
    rewrites,
    cleanUrls: true,
    markdown: {
      anchor: { slugify },
      languages: [fsh],
      // Vue compiles each page as a template, so a literal x-fhir-query `{{…}}` fragment would be
      // read as an interpolation. Encoding the braces keeps them as text.
      config(md) {
        for (const name of ['text', 'code_inline'] as const) {
          const render = md.renderer.rules[name];
          if (render === undefined) continue;
          md.renderer.rules[name] = (...args) =>
            render(...args).replaceAll('{{', '&#123;&#123;').replaceAll('}}', '&#125;&#125;');
        }
        // Runs before VitePress's own link rule, which then resolves the changed link.
        const linkOpen = md.renderer.rules.link_open;
        md.renderer.rules.link_open = (tokens, idx, options, env: { relativePath: string }, self) => {
          const token = tokens[idx];
          const href = token?.attrGet('href');
          const link = href == null ? undefined : siteLink(href, env.relativePath);
          if (link !== undefined) token?.attrSet('href', link);
          return linkOpen === undefined
            ? self.renderToken(tokens, idx, options)
            : linkOpen(tokens, idx, options, env, self);
        };
      },
    },
    lastUpdated: true,
    // The docs link to the report schema and example reports; the build only emits pages.
    buildEnd({ srcDir, outDir }) {
      for (const dir of ['docs/schemas', 'docs/examples']) {
        cpSync(join(srcDir, dir), join(outDir, dir), {
          recursive: true,
          filter: (source) => extname(source) === '' || extname(source) === '.json',
        });
      }
    },
    themeConfig: {
      search: { provider: 'local' },
      outline: [2, 3],
      nav: [
        { text: 'Guide', link: '/' },
        { text: 'Getting started', link: '/docs/getting-started' },
        { text: 'Rules', link: '/docs/rules/' },
        { text: 'Core', link: '/docs/core/' },
        { text: 'CLI', link: '/docs/cli' },
        { text: 'Report format', link: '/docs/report-format' },
        { text: 'Architecture', link: '/docs/architecture' },
      ],
      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Getting started', link: '/docs/getting-started' },
            { text: 'Glossary', link: '/GLOSSARY' },
          ],
        },
        {
          text: 'Lint rules',
          items: [
            { text: 'Overview', link: '/docs/rules/' },
            ...ruleLibrary().map(({ group, rules }) => ({
              text: group.title,
              collapsed: true,
              items: rules.map(({ id, link }) => ({ text: id, link })),
            })),
          ],
        },
        {
          text: 'Packages',
          items: [
            {
              text: 'Core',
              link: '/docs/core/',
              collapsed: true,
              items: [
                { text: 'CLI', link: '/docs/core/cli' },
                { text: 'Config', link: '/docs/core/config' },
                { text: 'Plugins and rule set', link: '/docs/core/plugins' },
                { text: 'Inputs', link: '/docs/core/inputs' },
                { text: 'Expression discovery', link: '/docs/core/discovery' },
                { text: 'Expression parsing', link: '/docs/core/parsing' },
                { text: 'Name analysis', link: '/docs/core/names' },
                { text: 'Rule runner', link: '/docs/core/runner' },
                { text: 'Suppressions and fingerprints', link: '/docs/core/suppressions' },
                { text: 'Source mapping', link: '/docs/core/source-mapping' },
                { text: 'Report and formatters', link: '/docs/core/report' },
                { text: 'Failures', link: '/docs/core/failures' },
              ],
            },
            {
              text: 'Smart Forms plugin',
              link: '/docs/plugin-smart-forms/',
              collapsed: true,
              items: [
                { text: 'Entry and compat', link: '/docs/plugin-smart-forms/entry-and-compat' },
                { text: 'Runtime facts', link: '/docs/plugin-smart-forms/facts' },
                { text: 'Site eligibility', link: '/docs/plugin-smart-forms/eligibility' },
                { text: 'Population model', link: '/docs/plugin-smart-forms/population' },
                { text: 'Form readers', link: '/docs/plugin-smart-forms/readers' },
                { text: 'Supplied names', link: '/docs/plugin-smart-forms/supplied-names' },
                { text: 'Rules', link: '/docs/plugin-smart-forms/rules' },
                {
                  text: 'Evidence and reproduction',
                  link: '/docs/plugin-smart-forms/evidence',
                },
              ],
            },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'CLI', link: '/docs/cli' },
            { text: 'JSON report format', link: '/docs/report-format' },
            { text: 'Report examples', link: '/docs/examples/reports/README' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'How the linter works', link: '/docs/architecture' },
            { text: 'Adding a rule', link: '/docs/adding-a-rule' },
            {
              text: 'Testing rules with lint cases',
              link: '/docs/lint-cases/',
              collapsed: true,
              items: [
                { text: 'Case config', link: '/docs/lint-cases/config' },
                { text: 'FSH generation', link: '/docs/lint-cases/fsh' },
                { text: 'Compiled project', link: '/docs/lint-cases/project' },
                { text: 'Case tests', link: '/docs/lint-cases/tests' },
              ],
            },
            { text: 'Linter design guidelines', link: '/docs/linter-design-guidelines' },
          ],
        },
        {
          text: 'Design and planning',
          collapsed: true,
          items: [
            { text: 'Core plan', link: '/docs/core-plan' },
            { text: 'Plan amendments', link: '/docs/plan-amendments' },
            { text: 'Core rules plan', link: '/docs/core-rules' },
            { text: 'Smart Forms rules plan', link: '/docs/smart-forms-rules' },
            { text: 'Slice 5 review', link: '/docs/reviews/slice-5' },
          ],
        },
      ],
    },
  }),
);
