# Change log

This log documents changes for
[@aehrc/sdc-questionnaire-lint-plugin-smart-forms](https://www.npmjs.com/package/@aehrc/sdc-questionnaire-lint-plugin-smart-forms).
This project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-05

### Added

- First release: a plugin for `@aehrc/sdc-questionnaire-lint` that reports where
  [Smart Forms](https://github.com/aehrc/smart-forms) behaves differently from the SDC
  specification. Requires `@aehrc/sdc-questionnaire-lint` 0.1.x.
- 9 rules for expressions Smart Forms ignores, evaluates in the wrong language or can't resolve:
  unavailable `%questionnaire` and `%qitem`, unsupported query embeddings, variable name
  collisions, variables in repeating groups, forward references during population, and
  templateExtractContext values template extraction ignores.
- `compat` selects the Smart Forms versions to check against. Verified versions: renderer 1.4.0,
  populate 4.7.1 and template-extract 1.0.15.
- The names Smart Forms population binds to sourceQueries results, so `sdc/undefined-variable`
  accepts them.
