---
'sdc-questionnaire-lint': minor
---

Add the `sdc-lint` CLI skeleton.

- `--help` and `--version`.
- Usage errors exit 2 with an error and help on stderr; under `lint --format json` a failed report is also written to stdout.
- `sdc-questionnaire-lint` is an alias of `sdc-lint`.
