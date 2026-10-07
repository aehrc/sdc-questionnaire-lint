import type { LintPlugin } from '../plugins/types.js';
import type { Severity } from '../report/types.js';

// A rule's setting in rules: its severity, or off to not run it.
export type RuleSetting = Severity | 'off';

// One entry of suppress: hides one rule's findings at the one Expression its selectors match.
// Every selector given must match.
export interface SuppressionEntry {
  rule: string;
  reason: string;
  // The input file, relative to the config's directory.
  file: string;
  linkId?: string;
  extensionUrl?: string;
  // The Expression's name, such as a variable's name.
  name?: string;
  // <resourceType>/<id> of the Questionnaire, for a Bundle with several.
  resource?: string;
  // The site's JSON Pointer, as the report's jsonLocation.pointer shows it.
  pointer?: string;
}

// The config file's contents. Paths inside it are relative to the config's directory.
export interface LintConfig {
  files?: string[];
  source?: { fsh?: string[] };
  // Only in an .mjs config. Installing a plugin does not enable it; listing it here does.
  plugins?: LintPlugin[];
  rules?: Record<string, RuleSetting>;
  suppress?: SuppressionEntry[];
}

// Types an .mjs config's default export: export default defineConfig({ … }).
export function defineConfig(config: LintConfig): LintConfig {
  return config;
}
