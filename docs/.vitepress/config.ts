import { cpSync } from 'node:fs';
import { extname, join } from 'node:path';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

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
    rewrites: { 'README.md': 'index.md' },
    cleanUrls: true,
    markdown: {
      // Vue compiles each page as a template, so a literal x-fhir-query `{{…}}` fragment would be
      // read as an interpolation. Encoding the braces keeps them as text.
      config(md) {
        for (const name of ['text', 'code_inline'] as const) {
          const render = md.renderer.rules[name];
          if (render === undefined) continue;
          md.renderer.rules[name] = (...args) =>
            render(...args).replaceAll('{{', '&#123;&#123;').replaceAll('}}', '&#125;&#125;');
        }
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
        { text: 'CLI', link: '/docs/cli' },
        { text: 'Report format', link: '/docs/report-format' },
        { text: 'Architecture', link: '/docs/architecture' },
      ],
      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Glossary', link: '/GLOSSARY' },
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
            { text: 'Slice 5 review', link: '/docs/reviews/slice-5' },
          ],
        },
      ],
    },
  }),
);
