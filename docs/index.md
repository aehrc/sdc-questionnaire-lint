# sdc-questionnaire-lint

Static checks for the FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires. It finds expressions that do not parse, unknown functions, undeclared variables and linkIds that name no item, without running the form. The CLI command is `sdc-lint`.

## How to lint

In a SUSHI implementation guide, compile it, then lint from the IG's directory. With no paths, `sdc-lint lint` checks `fsh-generated/resources` and points each finding at its FSH line:

```sh
sushi . && npx sdc-lint lint
```

For other Questionnaire or Bundle JSON, give files, directories or quoted globs:

```sh
npx sdc-lint lint "questionnaires/*.json"
```

The run exits 0 with no errors, 1 with errors, and 2 when it could not complete. [Getting started](/docs/getting-started.md) covers installation and configuration.

## Flags

| Flag | Default | Meaning |
| :- | :- | :- |
| `--format text\|json\|github\|sarif` | `text` | Output format: text, a JSON report, GitHub Actions annotations, or SARIF |
| `--show-info` | off | Also show info findings in text output |
| `--config <path>` | discovered | Use this config instead of `sdc-questionnaire-lint.config.json` or `.mjs` in the working directory |
| `--help` | | Print usage and examples |
| `--version` | | Print the linter version |

`sdc-lint explain [rule-id]` prints a rule's documentation, or lists the rules. The [CLI reference](/docs/cli.md) has the full contract.
