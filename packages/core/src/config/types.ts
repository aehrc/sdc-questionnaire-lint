import type { LintPlugin, Severity } from '../plugins/types.js';

export type RuleSetting = Severity | 'off';

// One entry of the config's suppress array (core-plan §6.3). Selector rules are checked when
// suppressions are applied.
export interface SuppressionEntry {
  rule: string;
  reason: string;
  file?: string;
  linkId?: string;
  extensionUrl?: string;
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
