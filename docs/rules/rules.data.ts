import { defineLoader } from 'vitepress';
import { ruleSummaries, type RuleSummary } from '../.vitepress/rules.js';

// The rules of each group, by group ID, for the library's index page.
export type Data = Record<string, RuleSummary[]>;

declare const data: Data;
export { data };

export default defineLoader({ load: ruleSummaries });
