# Report examples

Complete version 1 reports for [cli.md](../../cli.md), validated against [lint-report.schema.json](../../schemas/lint-report.schema.json). Field semantics and constraints beyond structural validation are in [report-format.md](../../report-format.md).

| Example | Scenario | Exit code |
| :- | :- | :- |
| [completed.json](completed.json) | Clean full run with multiple FSH directories, a skipped file and resolved Smart Forms versions | 0 |
| [mapped.json](mapped.json) | Error finding mapped to FSH, with a suggestion naming an exact edit range and expected old text | 1 |
| [unmapped.json](unmapped.json) | Root-level expression in a bundled Questionnaire, without FSH sources; the file and resource/site pointers still identify it | 1 |
| [stale-suppression.json](stale-suppression.json) | Full run establishes that a suppression targets a deleted file; the finding points to the `.mjs` config entry | 0 |
| [targeted.json](targeted.json) | Error in the selected file; a suppression for another file is not assessed and does not produce a stale finding | 1 |
| [failed.json](failed.json) | Missing explicit input; no partial findings or completed-run summary | 2 |

Versions, filenames and fingerprints are illustrative. The referenced FSH, config and compiled input files are not fixtures in this directory. These examples describe the report contract, not execution against an implemented CLI. A JSON-string suggestion for generated input remains `maybe-incorrect`; the maintained FSH source must be located before making the corresponding source edit.
