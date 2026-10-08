# JSON report format

The version 1 machine contract for `sdc-lint lint --format json`. [cli.md](cli.md) defines invocation, streams and exit codes. [schemas/lint-report.schema.json](schemas/lint-report.schema.json) defines structural validation; the relationships and counting rules below are also part of the contract. [Complete examples](examples/reports/README.md) illustrate each report and location variant.

## Report envelope

Every report has `schemaVersion: 1` and a `status`:

| Status | Required fields | Exit code |
| :- | :- | :- |
| `completed` | `run`, `findings`, `summary` | 0 when `summary.errors` is zero, otherwise 1 |
| `failed` | `failure` | 2 |

A completed report cannot contain `failure`. A failed report cannot contain `run`, `findings` or `summary`. It makes no claim about inputs processed before failure. Completion means all enabled checks that could run have finished; unchecked expressions remain visible in coverage counts.

## Run metadata and summary

`run` records:

| Field | Meaning |
| :- | :- |
| `tool` | `{ "name": "sdc-questionnaire-lint", "version": "…" }` |
| `plugins` | Array of `{ "name": "…", "version": "…" }`, including built-in `sdc`, sorted by namespace |
| `compat` | Resolved component versions by plugin namespace; `{}` without a compatibility plugin. For Smart Forms, `smart-forms` contains exact `renderer`, `populate` and `template-extract` versions, never `latest` |
| `selection` | `full` when using configured/default inputs; `targeted` when CLI paths are supplied |

`run.tool.name` identifies the package as `sdc-questionnaire-lint`, whether invoked as `sdc-lint` or through the long executable alias. Versions come from installed packages and the installed compatibility matrix. The examples use illustrative versions. Loading a plugin does not imply that every rule it provides is enabled; `explain` lists effective rule severities.

`summary` records:

| Field | Meaning |
| :- | :- |
| `files.read` | Unique input files successfully read and parsed, after canonical-path deduplication |
| `files.skipped` | Subset of `files.read` containing neither a Questionnaire nor a Bundle |
| `questionnaires` | Questionnaire resources checked, including those in Bundles; different resources in one file count separately |
| `expressions.analysed` | Expression sites for which all applicable enabled expression checks completed |
| `expressions.unchecked` | Expression sites for which at least one applicable enabled check could not be performed, or no supported expression analysis was available |
| `errors`, `warnings`, `info` | Counts of unsuppressed findings at each severity, including configuration findings |
| `suppressedFindings` | Number of distinct findings removed by suppressions |
| `suppressions.applied` | Suppression entries that matched at least one finding before suppression |
| `suppressions.stale` | Entries established to be unnecessary under the assessment rules in `cli.md` |
| `suppressions.notAssessed` | Remaining entries, including targets outside a targeted run and rules that could not check a selected target |
| `config` | Selected config path, or `null` when none was used |
| `fshSources` | Array of available FSH directory paths, sorted and deduplicated; `[]` when none were available or lookup was omitted |
| `fshSourceLookup` | `enabled`, or `omitted` when config explicitly sets `source.fsh: []` |

Counts are non-negative integers. In a completed report, `questionnaires` is positive, `files.skipped <= files.read`, and `errors + warnings + info == findings.length`. Suppressed findings are excluded from these three severity counts. Each stale entry contributes one `lint/stale-suppression` warning. The three suppression-entry counts sum to the number of configured entries. Overlapping suppressions can each be applied, but a covered finding is counted only once in `suppressedFindings`.

Expression counts describe coverage, not correctness: a syntax check that completes and reports an error still analysed its expression. If a syntax error prevents dependent checks, that is an established invalid expression rather than an unchecked limitation. A supported check deliberately configured off does not itself make an expression unchecked. Count each discovered expression site once; each embedded FHIRPath fragment is a site, and its containing query is counted separately only if it has its own applicable analysis. Partial analysis puts the site in `unchecked`, not both counters. Lack of a reliable FSH mapping does not make an analysed expression unchecked. Do not infer complete runtime correctness from these counts.

## Findings and locations

Every finding has stable `ruleId`, `severity`, `message`, `fingerprint` and `kind` fields. `help`, `note`, `docsUrl`, `expression`, `relatedLocations` and `suggestions` are optional. Omit an unavailable optional field instead of inventing data. Messages state the problem; help states an action. Fingerprints use rule, resource and stable site identity, or for a launchContext or extractAllocateId its element and name, not source line numbers. Configuration fingerprints use the suppression selector and rule rather than its current array index.

| Kind | Required location fields |
| :- | :- |
| `questionnaire` | `jsonLocation` and `sourceLocation` |
| `config` | `configLocation`; no Questionnaire or FSH location is required or invented |

`jsonLocation` contains `file`, `pointer`, `resource`, and optional `linkId`. Both `pointer` and `resource.pointer` are JSON Pointers from the root of the input file. `resource` contains its `resourceType`, optional `id`, and the pointer to that resource: `""` for a standalone root, `/entry/0/resource` for a Bundle entry, or the corresponding contained-resource pointer. The resource pointer identifies a resource even when an ID is absent or duplicated. The finding pointer identifies the exact site, including root-level expressions without an item.

`sourceLocation` uses the plan's source-map union:

- Mapped: `{ "status": "mapped", "confidence": "exact" | "anchored", "location": { "file", "line", "column", "endLine", "endColumn" } }`.
- Unmapped: `{ "status": "unmapped", "reason": "ambiguous" | "multiline" | "not-found" | "source-unavailable" }`, with no coordinates.

Mapped ranges cover the reported span; when no finer span is known, they cover the expression. Lines and columns are one-based, columns count UTF-16 code units, and end positions are exclusive. Ranges refer to actual file contents, accounting for FSH escapes and line endings. `exact` and `anchored` describe the mapping evidence, not whether an edit is safe.

`configLocation` contains `file` and `pointer`. The pointer addresses the parsed JSON config or the exported `.mjs` configuration object, such as `/suppress/0`. It does not claim a JavaScript source position. A stale-suppression finding uses this location even when the original input or expression has been deleted.

`expression`, when present, contains `text`: the complete decoded expression or query string at the finding's JSON Pointer. Optional `range` contains `startOffset` and `endOffset`, zero-based UTF-16 offsets into that same string, with an exclusive end. Rebase embedded-fragment positions onto the containing query. Do not provide a caret span when its position is unknown.

`relatedLocations` is an array of location records using the same `kind` and location fields, with an optional `message` explaining each relationship. Collisions and duplicates include the other relevant sites. All file paths use the CLI's working-directory-relative convention and `/` separators.

## Suggestions

A suggestion contains `description`, `applicability` and a non-empty `edits` array. Applicability is `machine-applicable`, `maybe-incorrect` or `has-placeholders`; only `machine-applicable` is eligible for unattended application. The CLI does not apply edits in the first version.

Every edit includes `oldText`, `replacement` and an explicit `target`:

| Target kind | Coordinates | Text being replaced |
| :- | :- | :- |
| `source` | `file`, `line`, `column`, `endLine`, `endColumn` | Exact file text in the stated range, including any source-language escaping |
| `json-string` | `file`, `pointer`, `startOffset`, `endOffset` | Slice of the decoded JSON string at that pointer |

Source coordinates follow the mapping conventions above; JSON-string offsets are zero-based UTF-16 units with an exclusive end. These are edit ranges, not implicit references to the finding's display range. Consumers must verify `oldText` before applying an edit. An empty range and empty `oldText` represent insertion. Edits in a suggestion refer to the same pre-edit content and must not overlap.

Prefer FSH source edits when FSH is the maintained source. A JSON-string target can describe a precise candidate when only the compiled location is known, but must not be marked machine-applicable when it would edit generated JSON instead of the maintained FSH. If no precise edit can be described, use `help` and omit the suggestion. Mapping confidence alone never makes a suggestion machine-applicable.

## Failures

`failure` requires `code`, `message` and `help`. `path` identifies a relevant file, directory or unmatched pattern when known. `ruleId` is required for a rule crash. Paths and patterns are rendered relative to the working directory after resolving their input/config base.

| Code | Meaning |
| :- | :- |
| `USAGE_ERROR` | Invalid arguments after a valid JSON-format selection |
| `CONFIG_INVALID` | Missing, unreadable, ambiguous or invalid config; invalid rule options; plugin loading failure |
| `INPUT_NOT_FOUND` | Selected literal input does not exist |
| `INPUT_PATTERN_UNMATCHED` | Selected glob or directory yields no files after exclusions |
| `INPUT_UNREADABLE` | Selected input cannot be read, or required input existence/traversal checks cannot complete |
| `INPUT_INVALID_JSON` | Selected input is not valid JSON |
| `NO_QUESTIONNAIRES` | Parsed selection contains no Questionnaires |
| `RULE_CRASH` | Unexpected rule exception; `ruleId` names that rule |
| `INTERNAL_ERROR` | Other unexpected execution failure |

The message explains this occurrence; the help gives a concrete next step. Codes are stable and never reused for another cause. Stack traces are not part of the machine contract. Consumers branch on `status` and `code`, not message text.

## Schema evolution and validation

The schema uses JSON Schema draft 2020-12. New optional fields and documented enum values may be added within version 1; removing fields, changing their meaning or changing existing field types requires a new `schemaVersion`. Consumers tolerate unknown fields and handle unknown enum values conservatively. In particular, an unfamiliar status, severity or applicability must not be interpreted as a clean result or permission to apply an edit. The exit status remains authoritative for whether the invocation passed.

The published schema enumerates values emitted by that revision of the producer; consumers using an older schema must allow for documented additive evolution. The schema admits additional properties while enforcing the mutually exclusive report and location variants. Validate examples against the schema and check count relationships, range ordering, offsets, pointer/resource relationships and suppression scope separately; those semantic constraints are not all expressible in JSON Schema.
