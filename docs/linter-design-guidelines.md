# Linter design guidelines

Evidence-based rules for building `sdc-questionnaire-lint`, for both human and AI-agent consumers.
Distilled from a research report (Oct 2026, 93 sources). Source numbers refer to the [References](#references) list.

[cli.md](cli.md) defines the first-version command and output behavior; [report-format.md](report-format.md) and its schema define the machine record. [plan-amendments.md](plan-amendments.md) records decisions that override the original plan.

## Core idea

Every finding has three readers:

- **The author** needs a short, correct statement in their own terms, at the place they are already working.
- **The pipeline** needs stable IDs, exit codes, a versioned schema and fingerprints.
- **The agent** needs both of those, plus remediation it can act on and guardrails against shortcuts.

Serve all three from one structured record, rendering it differently per reader. Never make one reader parse output meant for another.

Most of what makes a linter "AI-friendly" is ordinary rigor. The agent-specific additions are narrow: actionable remediation, concise output, and resistance to being disabled.

## 1. Trust: precision beats coverage

- A finding the reader doesn't act on counts as a false positive, even when it is technically correct. This is Google's "effective false positive" [1].
- Budget: at most ~10% effective false positives for non-blocking checks, and **0%** for checks that fail CI [1][2].
- Above ~30% false positives, people stop reading the tool. Early false positives hurt trust most, because the first few reports shape opinion [3].
- Agents don't ignore noise; they act on it. Each false positive becomes an unnecessary edit, and a run of them pushes the agent toward suppressing the check.
- When the analysis is uncertain, say less. Report `info` / "unchecked" instead of a confident error. actionlint falls back to an `any` type rather than guessing [4].
- Don't flag patterns the spec allows. SDC states that redefining a variable in a descendant item is **not an error** [5]. So `sdc/shadowed-declaration` should be `info` or opt-in, not a warning.
- Give each rule a maturity path, `preview` → `stable`, and promote it only after measuring its false-positive rate on real forms. Clippy, Ruff and Google all do this [6][7][2].
- Keep output deterministic: the same input and the same version must give the same findings in the same order [3].

## 2. Placement: show findings where the change happens

- The same Infer analysis at the same false-positive rate was fixed ~0% of the time as a batch report, and >70% of the time at diff time [8].
- Run the same rule IDs in every place: the local command, CI, PR annotations and agent hooks [9].
- Roll out report-only first. Make errors blocking once the existing findings are fixed or recorded as exceptions (Google's clean-then-enforce approach) [1].
- Keep the linter fast; an agent pays the latency on every generate → lint → fix iteration [10].

## 3. Messages

Each message answers **what** is wrong, **why** it matters for the form, and **how** to fix it [2][11][12].

- Write for Questionnaire/IG authors. Name the item by its text and linkId, and state the consequence in author terms ("this field will not prefill").
- Keep implementation terms ("scope", "AST", "evaluation context") out of the main message. Put technical detail in JSON fields; SARIF and `--verbose` are deferred.
- Make the first sentence a self-contained summary. GitHub and SARIF viewers truncate after it [13][14].
- Keep the parts of a diagnostic separate [15]:
  - `message`: the problem.
  - `help`: the fix, as an assertion, not a question: `help: a variable with a similar name exists: %patientName`, not "Did you mean …?".
  - `note`: context.
- Point at the exact span (expression text, or the `{{…}}` fragment) and show the author's own source with a caret [16][17].
- For collisions and duplicates, show **both** locations via `relatedLocations` [18].
- Suggest a fix only when confident [19]. Don't pad messages with long explanations; research on "enhanced" messages is mixed [19][20]. Long-form help belongs in the rule docs.
- Remediation must name an action the reader can take. For an agent, that means "edit X in file Y to Z", not "consult the SDC spec" or "run command W" [21].
- Snapshot-test one fixture questionnaire per rule in text and JSON, so wording changes are reviewed like code [16]. Add SARIF snapshots when that format is implemented.

## 4. Machine contract (where AI-friendliness mostly lives)

### Exit codes

| Code | Meaning |
|---|---|
| 0 | No unsuppressed errors (warnings/info may remain) |
| 1 | One or more unsuppressed errors |
| 2 | Config, input or execution failure; analysis did not complete |

This matches ESLint and Ruff [22][23]. Write findings before exiting with 1.

### Finding schema (JSON)

Version the schema, and allow new optional fields and enum values to be added [24]. Consumers tolerate additions and treat unfamiliar values conservatively; an unknown severity or applicability never establishes a clean result or permission to apply an edit. Never ship an unstable machine format [25].

The authoritative fields and semantic constraints are in [report-format.md](report-format.md), backed by a [JSON Schema](schemas/lint-report.schema.json) and [complete examples](examples/reports/README.md). A completed report includes findings, coverage counts, the selected config, available FSH sources, tool/plugin versions and resolved compatibility targets. A handled failure has a distinct envelope and stable failure code, rather than requiring a consumer to parse English stderr.

- **Fix safety is declared by the producer.** Every suggestion carries an applicability: `machine-applicable` | `maybe-incorrect` | `has-placeholders` [15][24]. Only `machine-applicable` may be applied unattended; be conservative. "No autofix" can stay, but `maybe-incorrect` suggestions are the most useful field an agent can get.
- Every suggested edit names its source range or JSON-string pointer and offsets, expected old text, and replacement. If a precise target is unavailable, provide help without an edit. Mapping confidence does not establish edit safety.
- **Never invent locations.** When mapping fails, return `unmapped` with a reason and keep the JSON location [26][27]. SUSHI's `fsh-index.json` maps only to whole definitions, not individual rules [28].
- Keep resource identity and file-relative JSON Pointers for Bundle and root-level findings. Stale suppressions point to the config entry, including when their former Questionnaire site no longer exists.
- The output must map losslessly onto LSP diagnostics (code + docs link, related information, `data`) and SARIF results [29].

### SARIF / GitHub

- `ruleId` must be stable. Fingerprints must survive line moves and must not contain absolute line numbers [13].
- GitHub matches results using `partialFingerprints.primaryLocationLineHash` [14].
- GitHub limits [14]:
  - SARIF files: 10 MB gzipped, 20 runs per file, 25k results per run, of which only the top 5k are shown.
  - Annotations: about 10 errors + 10 warnings per step and 50 per job [30].
  - So always also write the full findings to the job summary/log.
- Use `helpUri` for the rule docs link, and `baselineState` if baselines are ever added [13].

### Output modes

- `text`: has a stable first line (`file[:line:col]: severity rule-id message`) for problem matchers, followed by an excerpt and caret when known. Unmapped findings retain a compiled resource/site locator.
- `json`: includes all severities, explicit completed/failed status, structured locations and suggestions. Other formats are deferred; keep default output economical [31][32].
- Always end completed text output with counts, including an explicit "0 findings" only when no unsuppressed findings remain [33], coverage and suppression counts, and the resolved Smart Forms versions behind `"latest"`. Hidden info findings remain in totals; `--show-info` reveals them without changing analysis or exit status.
- `explain <rule-id>`: prints the rule doc offline (what it checks, why it matters, an example message, how to fix, known limitations) [11][23]. It shares config/plugin selection with `lint`; without an ID it lists registered rules, including configured-off rules, with default/effective severity and enabled status.

## 5. Rules and plugins

- IDs use `<namespace>/<rule-name>`, the same everywhere (config, suppressions, docs, reports). Never reuse a retired ID [13][22].
- Rule metadata declares: description, default severity, docs URL, stability (`preview`/`stable`), whether it emits suggestions, and an options schema. Validate options and reject unknown rule IDs [12].
- Rule docs follow a fixed template: **What it checks / Why it matters / Example message / How to fix / Known limitations** [11].
- Compatibility data is **data, pinned with the plugin**:
  - `"latest"` means the newest version in the installed matrix, and it only moves through a dependency-bump PR that shows any new findings [34][35].
  - Never silently substitute a nearby version. Pin plugin versions exactly [36].
- Rules are pure: synchronous, read-only input, no network access, no formatting of output. A crash in a rule fails the run and names that rule.

## 6. Suppressions and adoption

- Most suppressions are tech debt or come from misleading guidance, not false positives [37]. Treat a high suppression rate as a sign of a message or rule problem.
- Every suppression needs a written reason [38][39]. Select by stable identity (file + linkId + extension URL), not array-based JSON pointers.
- **Stale suppressions:** report a warning only after the target has been assessed or confirmed to no longer exist, under the full/targeted-run rules in [cli.md](cli.md#stale-suppressions). Targets outside a targeted run are not assessed. Stricter CI handling with `--strict-suppressions` is deferred until the blocking stage; first-version behavior is identical locally and in CI. Unused-suppression reporting follows the motivation behind ESLint and Rust's `#[expect]` [38][40].
- No inline disable comments in FSH. All exceptions live in config and are visible in the PR diff.
- No baseline file for now: this is a scale assumption for a single IG. If adoption grows, use a **shrink-only** baseline (ESLint bulk suppressions, Psalm) [41][42].
- Measure effective false positives per rule during the report-only stage (findings that get suppressed or left unfixed). Use ~10% as the bar for making a rule blocking [2].

## 7. Agents

Evidence that linter feedback helps agents:

- Removing the linter from SWE-agent's edit loop cut its SWE-bench Lite score from 18.0% to 15.0% [43].
- Iterative static-analysis feedback cut security issues in GPT-4o code from >40% to 13% [44].
- OpenAI writes lint messages "to inject remediation instructions into agent context" [45].

Do:

- Keep the CLI a thin adapter over the library, so hooks and MCP servers reuse the same findings.
- Ship integration recipes, not a separate "agent mode" with different semantics:
  - **AGENTS.md** snippet: "run `npm run lint` (SUSHI then lint) before finishing; fix findings in FSH; never add or broaden a suppression or turn a rule `off` without human approval." [46][47]
  - **Claude Code PostToolUse hook** on FSH edits: runs SUSHI and the linter, then adapts the linter's exit status to the host hook's feedback semantics [48]. Use text or JSON; concise output is deferred.
  - A thin **MCP server** exposing `lint` and `explain` is deferred [49][50].
- Keep the default output short; context is a budget [31][32]. Use `--show-info`, JSON and `explain` for further detail in the first version.

Guard against gaming (agents do disable checks to get a green run [51][52]):

- Show added or removed suppressions and severity overrides prominently in the CI summary.
- Make stale suppressions blocking when the stricter CI stage is introduced; first-version warnings support the report-only trial.
- Enforce in CI and hooks (deterministic), not only through prose instructions (advisory) [47].
- Avoid rules an agent can never satisfy: hook loops are capped and will be broken [53].

## 8. Embedded languages and generated artifacts

- FHIRPath returns an empty collection for missing paths instead of an error, so typos fail silently at runtime. That is exactly why static checks pay off [54].
- "Valid FHIRPath" ≠ "valid for this engine". fhirpath.js implements a subset of FHIRPath, needs a FHIR model for choice types, and throws on undefined environment variables [55].
- For nested languages (FHIRPath inside x-fhir-query `{{…}}`): extract each fragment, analyse it separately, and re-base positions onto the host string. Track escape sequences and CRLF line endings [4].
- Don't repeat checks the FHIR Validator already does (structure, `que-*` invariants, enableWhen linkIds) [56].

## References

1. Sadowski et al., *Lessons from Building Static Analysis Tools at Google*, CACM 2018 — https://6826.csail.mit.edu/2020/papers/google-analysis-cacm.pdf
2. *Software Engineering at Google*, ch. 20 Static Analysis — https://abseil.io/resources/swe-book/html/ch20.html
3. Bessey et al., *A Few Billion Lines of Code Later* (Coverity), CACM 2010 — https://www.cs.columbia.edu/~junfeng/17sp-e6121/papers/coverity.pdf
4. actionlint checks — https://github.com/rhysd/actionlint/blob/main/docs/checks.md
5. HL7 SDC, Using Expressions — https://hl7.org/fhir/uv/sdc/STU3/expressions.html
6. Clippy lints — https://doc.rust-lang.org/clippy/lints.html
7. Ruff preview — https://docs.astral.sh/ruff/preview/
8. Distefano et al., *Scaling Static Analyses at Facebook*, CACM 2019 — https://discovery.ucl.ac.uk/id/eprint/10084236/
9. Factory, *Using Linters to Direct Agents* — https://factory.ai/news/using-linters-to-direct-agents
10. Better Stack, *Anti-Slop: Oxlint Rules for AI-Generated Code* — https://betterstack.com/community/guides/ai/anti-slop-oxlint/
11. Ruff rule docs (example) — https://docs.astral.sh/ruff/rules/unused-import/
12. Biome linter (rule pillars) — https://biomejs.dev/linter/
13. OASIS SARIF 2.1.0 — https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html
14. GitHub, SARIF support for code scanning — https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
15. rustc-dev-guide, Errors and lints — https://rustc-dev-guide.rust-lang.org/diagnostics.html
16. Czaplicki, *Compiler Errors for Humans* — https://elm-lang.org/news/compiler-errors-for-humans
17. Clang Expressive Diagnostics — https://clang.llvm.org/diagnostics.html
18. GCC Guidelines for Diagnostics — https://gcc.gnu.org/onlinedocs/gccint/Guidelines-for-Diagnostics.html
19. Becker et al., *Compiler Error Messages Considered Unhelpful*, ITiCSE WG 2019 — https://amirkamil.com/papers/iticse19.pdf
20. Santos & Becker, *Not the Silver Bullet* (2024) — https://arxiv.org/abs/2409.18661
21. Xu & Wu, *MCP Error Messages Written for Developers Hurt the Most Capable Agents Most* (preprint, 2026) — https://arxiv.org/abs/2609.35381
22. ESLint CLI — https://eslint.org/docs/latest/use/command-line-interface
23. Ruff linter — https://docs.astral.sh/ruff/linter/
24. rustc JSON output — https://doc.rust-lang.org/rustc/json.html
25. Biome reporters — https://biomejs.dev/reference/reporters/
26. SQLFluff templating — https://docs.sqlfluff.com/en/stable/configuration/templating/index.html
27. mozilla/source-map — https://github.com/mozilla/source-map
28. SUSHI `Processing.ts` (fsh-index) — https://github.com/FHIR/sushi/blob/master/src/utils/Processing.ts
29. LSP 3.17 specification — https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
30. GitHub Community #26680, annotation limits — https://github.com/orgs/community/discussions/26680
31. Anthropic, *Writing effective tools for agents* — https://www.anthropic.com/engineering/writing-tools-for-agents
32. Anthropic, *Effective context engineering for AI agents* — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
33. AXI, Agent eXperience Interface — https://axi.md/
34. MDN browser-compat-data — https://github.com/mdn/browser-compat-data
35. update-browserslist-db — https://github.com/browserslist/update-db
36. TFLint plugins — https://github.com/terraform-linters/tflint/blob/master/docs/user-guide/plugins.md
37. Liargkovas et al., *Quieting the Static* (2023) — https://arxiv.org/abs/2311.07482
38. ESLint, Configure Rules — https://eslint.org/docs/latest/use/configure/rules
39. eslint-comments/require-description — https://eslint-community.github.io/eslint-plugin-eslint-comments/rules/require-description
40. Rust Reference, diagnostic attributes (`#[expect]`) — https://doc.rust-lang.org/reference/attributes/diagnostics.html
41. ESLint bulk suppressions — https://eslint.org/docs/latest/use/suppressions
42. Psalm, dealing with code issues — https://psalm.dev/docs/running_psalm/dealing_with_code_issues/
43. Yang et al., *SWE-agent* (2024) — https://arxiv.org/abs/2405.15793
44. Blyth et al., *Static Analysis as a Feedback Loop* (2025) — https://arxiv.org/abs/2508.14419
45. OpenAI, *Harness engineering* (2026) — https://openai.com/index/harness-engineering/
46. AGENTS.md — https://agents.md/
47. Claude Code best practices — https://code.claude.com/docs/en/best-practices
48. Claude Code hooks reference — https://code.claude.com/docs/en/hooks
49. ESLint MCP server — https://eslint.org/docs/latest/use/mcp
50. Semgrep Guardian — https://docs.semgrep.dev/guardian
51. METR, *Recent Frontier Models Are Reward Hacking* (2025) — https://metr.org/blog/2025-06-05-recent-reward-hacking/
52. Arize, *How to evaluate AI agents … avoid reward hacking* — https://arize.com/blog/how-to-evaluate-ai-agents-and-build-better-specs
53. Claude Code hooks guide — https://code.claude.com/docs/en/hooks-guide
54. FHIRPath N1 — https://hl7.org/fhirpath/N1/
55. fhirpath.js — https://github.com/HL7/fhirpath.js
56. HL7 FHIR core validator messages — https://github.com/hapifhir/org.hl7.fhir.core
