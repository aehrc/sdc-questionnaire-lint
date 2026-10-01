---
'sdc-questionnaire-lint': minor
---

Add the `sdc-lint` CLI and the `lint()` library entry point.

- `sdc-lint lint [paths…]` checks Questionnaires in compiled JSON and Bundles, from CLI paths, the config's `files`, or `fsh-generated/resources`, and reports findings as text or as a versioned JSON report (`--format json`). Exit codes: 0 completed, 1 errors found, 2 the run did not complete.
- `sdc-lint explain [rule-id]` lists the registered rules or prints a rule's bundled documentation.
- Configuration in `sdc-questionnaire-lint.config.json` or `.mjs`, with `defineConfig`, plugins, rule severities, input `files` and FSH source directories.
- The plugin contract types (`LintPlugin`, `LintRule`, `RuleContext`) and the report types are exported.
- `sdc-questionnaire-lint` is an alias of `sdc-lint`.

The analysis engine is not included yet: there are no built-in `sdc` rules, FSH source mapping or suppression handling, so findings come only from configured plugins.
