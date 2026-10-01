import type { LintPlugin, Severity } from '../plugins/types.js';

export type RuleSetting = Severity | 'off';

// One entry of the config's suppress array (core-plan §6.3). It suppresses rule's findings in file
// that match every selector given.
export interface SuppressionEntry {
  rule: string;
  // Why the finding is acceptable; required.
  reason: string;
  // The input file, relative to the config directory.
  file: string;
  // linkId of the item enclosing the expression.
  linkId?: string;
  // URL of an extension on the path to the expression.
  extensionUrl?: string;
  // valueExpression.name of the declaring extension, such as a variable's name.
  declaration?: string;
  // The resource, as Questionnaire/<id>; for Bundles with several Questionnaires.
  resource?: string;
  // A JSON Pointer from the root of the file; covers findings at or below it.
  pointer?: string;
}

// The configuration file's contents. Paths inside it are relative to the config's directory.
export interface LintConfig {
  presets?: string[];
  // External plugins; only an .mjs config can list them.
  plugins?: LintPlugin[];
  compat?: Record<string, unknown>;
  languages?: Record<string, string>;
  source?: { fsh?: string[] };
  rules?: Record<string, RuleSetting>;
  files?: string[];
  suppress?: SuppressionEntry[];
}

// Typed identity function for sdc-questionnaire-lint.config.mjs.
export function defineConfig(config: LintConfig): LintConfig {
  return config;
}
