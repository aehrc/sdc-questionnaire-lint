# Change log

This log documents changes for
[@aehrc/sdc-questionnaire-lint](https://www.npmjs.com/package/@aehrc/sdc-questionnaire-lint). This
project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-05

### Added

- First release: a CLI and TypeScript library that statically checks the FHIRPath and x-fhir-query
  expressions in FHIR SDC Questionnaires, without running the form.
- 15 built-in rules for undefined, unused, duplicate and reserved variable names, dependency cycles,
  expressions that don't parse, unknown functions, invalid x-fhir-query syntax, disallowed
  expression languages and unresolved linkIds.
- FSH source mapping: in a SUSHI implementation guide, each finding points at the FSH file and line
  of its expression.
- Text, JSON, GitHub Actions annotation and SARIF output.
- Configuration and suppressions, with `lint/stale-suppression` to report suppressions that are no
  longer needed.
- Plugins, which can add rules.
