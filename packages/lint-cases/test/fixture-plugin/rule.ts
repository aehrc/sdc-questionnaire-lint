import type { LintRule } from '@aehrc/sdc-questionnaire-lint';

// Reports every declaration, so each case shows the plugin ran.
export const declaration: LintRule = {
  meta: { description: 'Reports every declaration.', defaultSeverity: 'info' },
  check(ctx) {
    for (const site of ctx.sites) {
      if (site.declares && site.name !== undefined) {
        ctx.report({ site, message: `%${site.name} is declared.` });
      }
    }
  },
};
