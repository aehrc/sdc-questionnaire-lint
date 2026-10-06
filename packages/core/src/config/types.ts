import type { Severity } from '../report/types.js';

export type RuleSetting = Severity | 'off';

// The config file's contents. Paths inside it are relative to the config's directory.
export interface LintConfig {
  files?: string[];
  source?: { fsh?: string[] };
  rules?: Record<string, RuleSetting>;
}
