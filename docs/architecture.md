# How the linter works

This is a map of one lint run through `packages/core/src`, then of the CLI around it, what a plugin can import and how the Smart Forms plugin in `packages/plugin-smart-forms/src` is built, for contributors. Terms follow [GLOSSARY.md](../GLOSSARY.md); the behaviour each step implements is specified in [core-plan.md](core-plan.md), [plan-amendments.md](plan-amendments.md) and [cli.md](cli.md).

## The pipeline

`lint()` in `packages/core/src/lint.ts` runs one lint run and returns a `CompletedReport`, or throws a `LintFailure` for a run that cannot complete (section 9).

The diagram shows the order of the calls; each node names the section that describes it. The sections follow the source directories, so `resolveRunPaths`, which runs after the rule set is resolved, is described with the config.

```mermaid
flowchart TD
  loadConfig["§1 loadConfig<br/>config/load.ts"] --> resolveRuleSet["§2 resolveRuleSet<br/>plugins/rule-set.ts"]
  resolveRuleSet --> resolveRunPaths["§1 resolveRunPaths<br/>config/paths.ts"]
  resolveRunPaths --> loadInputs["§3 loadInputs<br/>inputs/load-inputs.ts"]
  loadInputs --> findFshSources["§3 findFshSources<br/>run/sources.ts"]
  findFshSources --> findSushiVersion["§3 findSushiVersion<br/>run/sushi-version.ts"]
  findSushiVersion --> suppliedHostVariables

  subgraph analysis["§4 once per Questionnaire, before any rule runs"]
    suppliedHostVariables["suppliedHostVariables<br/>run/host-variables.ts"] --> findExpressionSites["findExpressionSites<br/>analysis/expression-sites.ts"]
    findExpressionSites --> analyseDocument["analyseDocument<br/>analysis/document-analysis.ts"]
  end

  subgraph rules["§5 once per Questionnaire"]
    runRules["runRules<br/>run/rules.ts"]
  end

  analyseDocument --> runRules
  runRules --> applySuppressions["§6 applySuppressions<br/>run/suppressions.ts"]
  applySuppressions --> mapSourceLocations["§7 mapSourceLocations<br/>source/map-findings.ts"]
  mapSourceLocations --> summarizeExpressionCoverage["§8 summarizeExpressionCoverage<br/>report/expression-coverage.ts"]
  summarizeExpressionCoverage --> buildSummary["§8 buildSummary<br/>report/summary.ts"]
  buildSummary --> report(["§8 CompletedReport<br/>report/types.ts"])
  report --> formatText["§8 formatTextReport<br/>report/text.ts"]
  report --> formatJson["§8 formatJsonReport<br/>report/json.ts"]
  report --> formatGithub["§8 formatGithubReport<br/>report/github.ts"]
  report --> formatSarif["§8 formatSarifReport<br/>report/sarif.ts"]
```

The CLI calls `lintWithRules()`, which is `lint()` returning the run's resolved rules as well, and writes the report with the reporter `--format` selects (section 9).

## 1. Config (`config/`)

- `load.ts`: `loadConfig` uses `--config` when given; otherwise it looks in the working directory only for `sdc-questionnaire-lint.config.json` or `sdc-questionnaire-lint.config.mjs`, and fails if both exist. It returns `null` when no config is used.
- `validate.ts`: `validateConfig` checks the config's shape. Plugins can be listed only in an `.mjs` config. A `hostVariables` entry must be a name (`hostVariableProblem`, which a plugin's hook results are checked with too), listed once, that FHIRPath, FHIR or SDC does not define.
- `paths.ts`: `resolveRunPaths` resolves `files`, `source.fsh` and the defaults against the config's directory, or the working directory when there is no config. It runs after `resolveRuleSet`.
- `types.ts`: the config's types, `LintConfig`, and `defineConfig`.

A config that cannot be loaded or is invalid fails the run with `CONFIG_INVALID`.

## 2. Rule set (`plugins/`)

`resolveRuleSet` in `rule-set.ts` builds the run's rule set from:

- the built-in `sdc` plugin (`sdcPlugin` in `builtin.ts`);
- the reserved `lint` namespace (`lintPlugin` in `builtin.ts`), used only for `lint/stale-suppression`;
- the plugins listed in the config.

It does this in four steps, all before any input is read, so `lint` and `explain` fail the same way:

1. `validatePlugin` checks each plugin's shape against the plugin contract, whose types are in `contract.ts`. A rule's `meta.docsUrl`, when present, must be an absolute URL ([plan-amendments.md](plan-amendments.md#from-the-smart-forms-p12-review-2026-10-14), Z). It also rejects a reserved or duplicate namespace.
2. It resolves the config's compatibility target (`compat`) against each plugin's compatibility matrix (`LintPlugin.compat`). `"latest"`, the default, takes the newest verified version of every component. An explicit object must name exact verified versions of the required components. Core treats versions as opaque strings. The result becomes the report's `run.compat`; each rule gets the versions of its own namespace as its `compat`, frozen.
3. It gives each rule its effective rule setting: the configured one, or the rule's default severity. It then rejects unknown rule IDs in `rules` and `suppress`, and suggests a similar name when one exists (`closestName` in `suggest.ts`). A compat error is therefore reported before an unknown rule ID.
4. It keeps, in config order, each listed plugin that has a `hostVariables` hook, with the same frozen compat its rules get (`hostVariableHooks`).

## 3. Inputs (`inputs/`)

`loadInputs` in `load-inputs.ts` runs these steps and fails with `NO_QUESTIONNAIRES` when none are found:

- `select.ts`: `selectInputEntries` picks the paths. CLI paths make a targeted run; otherwise the config's `files`, or the default directory, make a full run. These are precedence levels, not fallbacks: a list that fails to match never lets a later one run.
- `expand.ts`: `expandEntries` expands globs and directories. A path that does not exist fails with `INPUT_NOT_FOUND`, and a pattern or directory with no JSON file with `INPUT_PATTERN_UNMATCHED`. A missing or empty default directory is left to `NO_QUESTIONNAIRES`.
- `paths.ts`: `canonicalizeInputFiles` deduplicates files by their real path.
- `read.ts`: `readInputs` parses each file into `QuestionnaireDocument`s, standalone or from inside a Bundle. Every resource of a Bundle is kept as a `localResources` entry. JSON that is neither a Questionnaire nor a Bundle is skipped; a file that is not valid JSON fails with `INPUT_INVALID_JSON`.

A file or directory that cannot be read fails with `INPUT_UNREADABLE`.

Two lookups follow:

- `findFshSources` in `run/sources.ts` records which FSH directories exist, for the summary and for source mapping (section 7).
- `findSushiVersion` in `run/sushi-version.ts` finds the installed SUSHI as Node finds a package: `node_modules/fsh-sushi/package.json` in the run's base, then in each directory above it. Its version becomes the report's `run.sushi.version`, which is left out when none is found.

## 4. Expression discovery and analysis (`analysis/`)

This is the heart of the linter. Every document is analysed before any rule runs, so a hook's crash wins over a rule's.

First, `suppliedHostVariables` in `run/host-variables.ts` calls each plugin hook with the document and the plugin's compat, whether or not the plugin's rules are on. A throw, a promise or a result that is not an array of names fails the run with `PLUGIN_CRASH`, naming the plugin and the file; the names FHIRPath, FHIR or SDC define are dropped. The config's `hostVariables`, followed by the hooks' names, are the document's host variables.

Then:

- `expression-site.ts` defines the expression-site model rules receive: `QuestionnaireDocument`, `ExpressionSite`, `CataloguedLocation`, `QueryFragment`. It is public API.
- `extension-catalog.ts`: `extensionCatalog` is data, not code. It lists the SDC extensions the linter understands, such as variable, calculatedExpression, enableWhenExpression, initialExpression, itemPopulationContext, targetConstraint, and cqf-expression on primitive elements (`_title` on the root; `_text`, `_prefix` and `_answerValueSet` on items). For each one it records where the extension may sit, its sub-extension for a complex extension, and its use cases as the SDC expressions table lists them (rendering, population or extraction). Use cases do not decide which names an expression can reference. Supporting a new location means adding an entry here, not changing `expression-sites.ts`.
- `expression-sites.ts`: `findExpressionSites` walks a Questionnaire's JSON depth-first and returns a flat list of frozen `ExpressionSite`s in document order.
  - A site at a catalogued location is catalogued.
  - Any other object with a string `language` and either `expression` or `reference`, including in a contained resource, is uncatalogued; only its syntax and function names can be checked when text is present. A reference-only Expression remains unchecked and may prevent an unused-variable finding.
  - An x-fhir-query site with text is directly followed by one fragment site per closed `{{…}}` fragment: carrier `fragment`, language `text/fhirpath`, with offsets into the query.
  - A catalogued Expression with a `name` has `declares` set: it declares that name for other expressions.
- `declarations.ts`: `findDeclarations` lists a document's declarations in document order: the declaring sites (`variable`, `itemPopulationContext` and other named expressions), `launchContext` names on the root, and `extractAllocateId` names on the root and items. Each records its name, kind, pointer, declaring item (none for the root), use cases and, when it is an Expression, its site. Contained resources declare nothing; sourceQueries results are host variables, not declarations.
- `available-variables.ts`: `availableVariables` answers, for each catalogued site, which names its expressions can reference:
  - the declarations on its element, its ancestor items and the root, the innermost of a name winning;
  - the built-in names FHIRPath, FHIR and SDC define (`builtinNames`, plus the `vs-` and `ext-` prefixes);
  - the names the root's `assembleContext` lists, which the Questionnaire that includes the module supplies (`findAssembleContextNames` in `declarations.ts`; they are not declarations);
  - the host variables.

  An extraction site sees only extractAllocateId names and named extraction contexts among the declarations; any other site sees every declaration except extractAllocateId names, whatever the declaring expression's use cases. An uncatalogued site gets none, because name analysis cannot run there. At a declaring site, and in the fragments of its query, the declaration's own name resolves to the next binding outward, and to the declaration itself only when nothing else supplies the name ([core-rules.md](core-rules.md#declarations-and-availability), D25).
- `dependencies.ts`: `findDependencies` records, for each declaration, the declarations its expression references, resolved at the expression's site or at each fragment of its query, and whether that list is known: the expression parses and no reference follows a `defineVariable` with a computed name. A reference that may be bound locally is left out.
- `uses.ts`: `findUses` records, for each declaration, whether the expressions of others reference it:
  - `referenced` when a reference resolves to it;
  - `unreferenced` when none does and every expression that could see it was analysed;
  - `blocked` when only expressions with a syntax error were not analysed;
  - `unknown` otherwise. An expression that could see it but was not analysed is CQL or another language, an Expression with only a reference, FHIRPath that does not parse, an uncatalogued expression that names it, a reference after a `defineVariable` with a computed name, a `questionnaire-constraint`, or a `subQuestionnaire`.

  A reference from a declaration's own expression is not a use of it, and a duplicate on the same element shares the uses of the other.
- `linkids.ts`: `findLinkIds` lists the linkIds of a Questionnaire's items at any depth, not those of contained resources. `findLinkIdReferencesAt` gives the linkId references of each FHIRPath site that parses, with what the site establishes as items of this form: at a catalogued site, `%questionnaire`, `%resource`, `%context` and the expression's input, plus `%qitem` at an item site. Nothing is established at an uncatalogued site or in a modular Questionnaire, one that includes a `subQuestionnaire` or is a module (it has `assembleContext`, or an `assemble-expectation` that allows a child), because the assembled form has other items.
- `document-analysis.ts`: `analyseDocument` computes core's internal analysis of a document once per run, from the document, its sites and its host variables. It holds:
  - its declarations;
  - the variable references of each FHIRPath site that parses;
  - the available variables at each site (`variablesAt`);
  - the dependencies of each declaration, and their uses;
  - the Questionnaire's linkIds, and the linkId references of each FHIRPath site that parses;
  - found on first use, whether each such site reads its input (`readsInput`).

  `lint.ts` keeps it on each analysed document. It is not exported. A plugin rule receives only its references, `variablesAt`, declarations, dependencies, uses and `readsInput`, through `RuleContext`. They are frozen, because the suppression assessment reuses the same analysis after the rules run.

The analysis helpers:

- `fhirpath.ts` is the only place fhirpath.js is used. Its exports:
  - `findFhirPathSyntaxProblem` parses an expression and turns a parser error into offsets.
  - `findFunctionCalls` extracts function calls.
  - `findVariableReferences` lists `%name` references: each [reference](../GLOSSARY.md) gives the name fhirpath.js looks up and its range as written. A name that `defineVariable` binds for the later steps of its chain is left out, and a reference after a `defineVariable` with a computed name is marked incomplete. A reference is conditional where fhirpath.js 4.10.1 may skip evaluating it: in an `iif` argument after the criterion, a `coalesce` argument after the first, an argument evaluated once per item of the function's target (`where`, `select`, `exists`, `all`, `repeat`, the first of `aggregate`, `sort`'s selectors), below one of these, and in any argument of a call whose name has an escape sequence. Operator operands, `combine` and `union` arguments, and `trace`'s and `defineVariable`'s values are always evaluated ([smart-forms-rules.md](smart-forms-rules.md#p7-smart-formsforward-variable-reference), API stage D).
  - `findLinkIdReferences` finds linkId references: `where(linkId = …)`, its input followed through `item`, `answer`, `repeat`, `where` and `select` from the roots the site establishes. The literals of established references are listed, and the reference is uncertain when its input is not established or its linkId is computed. A selection that flows through item steps into `exists()`, `empty()` or a `count()` comparison is an absence probe and is left out.
  - `readsInput` tells whether an expression reads its input. It follows the focus as fhirpath.js 4.10.1 sets it: an argument typed `Expr`, and `sort`'s, is evaluated against the function's target; `coalesce`'s against its target with the enclosing `$this`; every other argument and operand against the enclosing `$this`, or else the input. A term on the input other than `linkId`, a function on it other than `iif`, `select`, `today`, `now` and `timeOfDay`, and the input itself used as a value, including through `%context`, read it.
- `x-fhir-query.ts` scans x-fhir-query strings for fragments and shape problems.
- `fhirpath-function-catalog.ts` is generated from fhirpath.js's `invocationTable` by `packages/core/scripts/generate-functions.ts`; never edit it by hand.

## 5. Rules (`rules/`, run by `run/rules.ts`)

`runRules` calls each rule that is not off once per Questionnaire. A rule's `check(ctx)` is synchronous. `ctx` provides:

- `document`, and `sites`, frozen, as is each site;
- `declarations`, the analysis's own frozen array;
- `referencesAt(site)`, `variablesAt(site)` and `readsInput(site)`: the analysis's references, available variables and input reads at a site;
- `dependenciesOf(declaration)` and `useOf(declaration)`: its dependencies and uses;
- `compat`: the versions selected for the rule's namespace; `{}` for a plugin without compat;
- `report()`.

[What a plugin can import](#what-a-plugin-can-import) gives the types and the meaning of `undefined` for each lookup. Each Questionnaire finding carries its rule's `docsUrl`: the value read when the plugin was validated, kept in `ResolvedRule.docsUrl`. An `sdc` rule also receives the document's analysis as a second argument (`CoreRule` in `plugins/core-rule.ts`); a plugin cannot register an `sdc` rule.

`rules/` holds one module per core rule; the [rules library](rules/index.md) documents each, and [adding-a-rule.md](adding-a-rule.md) is the guide to writing one. `rules/describe.ts` names the element a finding is on, by the item's text and linkId, and places a finding about a declaration at its Expression or its extension.

The runner validates every finding. A bad site, pointer or range, a throw, or a returned promise fails the run with `RULE_CRASH`, naming the rule and the file; built-in and plugin rules are treated alike. It then turns each finding into a report `Finding` with its JSON location, an expression excerpt, its related locations and a fingerprint. A finding in a fragment is shown within its whole query. Every finding starts with `sourceLocation` unmapped as `source-unavailable`. `runRules` also records each finding's document and site as a `FindingOrigin` in a side table keyed by the finding object, which the source mapper reads; `applySuppressions` passes the findings it keeps on unchanged, so the keys still match. Related locations stay unmapped.

## 6. Suppressions (`run/suppressions.ts`, `run/fingerprint.ts`)

Without a config, there are no suppressions and nothing is assessed.

- `applySuppressions` matches each `suppress` entry to exactly one expression by its selectors: `file` (required), `linkId`, `extensionUrl`, `name`, `resource` and `pointer`.
  - Only sites whose carrier is `expression` are candidates. A fragment shares its query's pointer, so suppressing the query also hides the findings in its fragments.
  - An entry that matches several expressions fails the run with `CONFIG_INVALID`.
  - An entry whose `extensionUrl` is launchContext or extractAllocateId instead matches one name on one element among the declarations, and hides the rule's findings at every declaration of that name there.
  - An entry hides the findings of its rule whose file and JSON pointer are its target's.
- `fingerprint.ts`: `siteKeys` gives each site a stable key based on its item's linkId and its catalogued location, plus its name when it declares one, rather than array indexes, so keys survive reordering. `declarationKeys` does the same for a launchContext or extractAllocateId by its item, kind and name. `questionnaireFingerprint` and `configFingerprint` build the findings' fingerprints from them; a Questionnaire finding's also has the text of its range, so two findings of one rule in one expression differ. `distinctFingerprints` keeps fingerprints unique within a report: a repeat is hashed again with its occurrence number, per document in `runRules` and across stale suppressions in `applySuppressions`.
- Every entry ends up applied, stale or not assessed:
  - not assessed when its file is outside the selection, or a targeted run cannot resolve it;
  - stale when a full run confirms its file no longer exists, or when no expression, or no declaration, in its file matches its selectors;
  - stale when its target exists, it hides nothing, its rule is on and the rule could have completed its check there. The `completesCheck` table in `plugins/builtin.ts` decides this from the site and the document's analysis, and `completesDeclarationCheck` for a declaration that has no site. A rule missing from it, such as a plugin rule, leaves such an entry not assessed.
- Stale suppressions are reported as `lint/stale-suppression` warnings at the config entry. With that rule off, staleness is not assessed. `lint/` findings cannot be suppressed.

## 7. Source mapping (`source/`)

`mapSourceLocations` in `map-findings.ts` gives each finding left after suppressions its FSH location, or the reason it has none (core-plan [§7.1](core-plan.md#71-mapping-a-finding-to-fsh) and [§7.2](core-plan.md#72-result-contract), and [plan-amendments.md](plan-amendments.md#from-the-source-mapping-design-2026-10-07)). It reads FSH only when a Questionnaire finding remains and FSH directories exist, and it never fails the run: an exception while mapping a finding leaves it `not-found`. It changes nothing but `sourceLocation`, so fingerprints and counts are the same with or without FSH.

For each finding, `locateExpression` in `locate.ts`:

1. finds the FSH Instance behind the finding's resource (`definitions.ts`): for the resource at the file's root, through the SUSHI index (`sushi-index.ts`) when its entry for the input file is current; otherwise, and always for a Bundle entry or a contained resource, by searching the FSH directories for the one Instance with the resource's id and type;
2. lists the Instance's expression literals with their anchors (`expression-literals.ts`): the linkId of their item, their extension and their Expression's name, found through the full path of every rule (`fsh-paths.ts`);
3. maps the finding's expression text:
   - text that occurs once in the resource's JSON and once in the Instance maps as `exact` when the literal's anchors are the expression's;
   - repeated text maps as `anchored` when the anchors single out one literal and one expression, except in a definition with an `insert` rule, where it is always `ambiguous`;
   - otherwise the finding stays unmapped as `ambiguous`, `multiline` or `not-found`;
4. turns the reported range into lines and columns (`positions.ts`), after reading the literal again from the file and checking that it and the range's source decode to the reported text (`fsh-string.ts`).

The FSH modules mirror SUSHI 3.20.1, so they read FSH as SUSHI does: `fsh-document.ts` splits a file into definitions and rules with SUSHI's longest-match tokens, `fsh-paths.ts` applies indentation context and soft indices as SUSHI's importer and `resolveSoftIndexing` do, and `fsh-string.ts` decodes strings as SUSHI's `unescapeQuotedString` does. `fsh-files.ts` reads and parses each FSH file of a run at most once.

## 8. Report (`report/`)

- `types.ts` defines the public report contract, which [report-format.md](report-format.md) specifies and [lint-report.schema.json](schemas/lint-report.schema.json) matches.
- `lint.ts` fills the report's `run` metadata: `tool`, `plugins` (the name and version of `sdc` and each listed plugin, sorted), `compat`, `selection` (full or targeted) and, when found, `sushi`.
- `summary.ts`: `buildSummary` counts the findings by severity; the rest of the summary comes from the earlier stages as it is.
- `expression-coverage.ts`: `summarizeExpressionCoverage` counts the analysed and [unchecked](report-format.md#run-metadata-and-summary) expressions for the summary. A site is analysed when it is catalogued, has text and is FHIRPath or x-fhir-query, unless an enabled rule applies there but could not complete. `incompleteSites` in `plugins/builtin.ts` lists those from its `leavesUnchecked` table:
  - a site where `sdc/undefined-variable` meets a reference after a `defineVariable` with a computed name;
  - a declaration from which `sdc/dependency-cycle` reaches a declaration with such a reference;
  - a variable whose use `sdc/unused-declaration` cannot establish (`unknown`);
  - a site where `sdc/unresolved-linkid` meets a linkId reference whose target or linkId is uncertain.

  A declaration that does not parse or is in another language is not followed, so it leaves nothing unchecked; a variable that only an expression with a syntax error could reference (`blocked`) is not unchecked either.
- `sort.ts`: `compareFindings` orders findings; every reporter uses it. It compares strings with `compareStrings` in `compare.ts`, which is locale-independent, so the order is the same on every machine.
- `locations.ts`: `primaryLocation` says where a finding or related location is (its FSH range, its compiled JSON site and the reason it is unmapped, or its config entry), and `findingDetailLines` gives the `location:`, `note:`, `related:` and `help:` lines. The text, GitHub and SARIF reporters share them.
- `json.ts`, `text.ts`, `github.ts` and `sarif.ts` are the four reporters: `formatJsonReport`, `formatTextReport`, `formatGithubReport` with `formatGithubSummary`, and `formatSarifReport`, which also describes the run's rules. `github.ts` and `sarif.ts` also render a failed run, for `renderFailureOutput`.

## 9. CLI and failures (`cli/`, `failure.ts`)

[cli.md](cli.md) is the contract; this is where it lives in the code.

- `main.ts` is the binary. It turns on the stdout guard for the whole process, then sets `process.exitCode` from `runCli`.
- `args.ts`: `parseCliArgs` parses argv. A usage error fails with `USAGE_ERROR`; once `lint --format` is recognised, the failure document goes to stdout in that format too.
- `run.ts`: `runCli` runs `lint` or `explain`, or writes the help (`help.ts`) or the version. For `lint`, it calls `lintWithRules()` and writes the report with the reporter `--format` selects. With `--format github`, it also passes `formatGithubSummary` to `appendStepSummary` in `step-summary.ts`, which appends it to the job summary that `GITHUB_STEP_SUMMARY` names. It exits 0, 1 when the report has errors, or 2 on a failure ([cli.md](cli.md#streams-and-exit-codes)).
- `output-guard.ts`: `guardStdout` sends `console.log`, `info`, `debug` and `process.stdout.write` to stderr while config and plugin code run, so only the report reaches stdout.
- `explain.ts`: `runExplain` loads the config and resolves the rule set as `lint` does, reads no input, and lists the rules or describes one ([cli.md](cli.md#explain)).

`failure.ts` holds `LintFailure` and its `FailureCode`s ([report-format.md](report-format.md#failures)). Each stage throws its own: `CONFIG_INVALID` (sections 1, 2 and 6), the input codes (section 3), `PLUGIN_CRASH` (section 4) and `RULE_CRASH` (section 5). `asLintFailure` turns anything else thrown into `INTERNAL_ERROR`. Every failure exits 2 and reports no findings. `renderFailureOutput` writes it in the selected format: a failure document on stdout in `json`, `github` and `sarif`, and a job-summary section in `github`; the error and its help go to stderr in every format.

## What a plugin can import

A plugin imports from the `sdc-questionnaire-lint` package only; everything under `packages/core/src` that `index.ts` does not export is internal. Besides `lint`, `LintFailure`, `defineConfig` and the options, report, failure and config types, `index.ts` exports the following. The name analysis is published in stages, each with the Smart Forms slice that first needs it ([smart-forms-rules.md](smart-forms-rules.md#public-api-stages-s5), S5).

- The plugin contract: `LintPlugin`, `LintRule`, `RuleContext`, `RuleFinding`, `RuleRelatedLocation`, `RuleDocs`, `PluginCompat` and `HostVariablesInput` (`plugins/contract.ts`). Besides its rules, a plugin can supply host variables through `LintPlugin.hostVariables({ document, compat })`: synchronous and pure, it only adds names, which resolve with `origin: 'host'` where no declaration or assembleContext name wins ([smart-forms-rules.md](smart-forms-rules.md#core-contract), S6).
- The expression-site model: `QuestionnaireDocument`, `ExpressionSite`, `CataloguedLocation`, `SiteItem` and the other types in `analysis/expression-site.ts`. There is no item-tree API: a plugin reads an item by resolving `site.item.pointer` against `document.resource`.
- The language lookups (API stage A):
  - `definedLanguages`: the six codes FHIR R4 and R5 define, frozen. A language outside them is `sdc/language-not-in-value-set`'s.
  - `languagesAllowedAt(location)`: the languages SDC allows at a catalogued location, or `undefined` where it allows any language. A language outside the list is `sdc/language-not-allowed`'s, or the FHIR Validator's: the list also rejects `application/x-fhir-query` on enableWhenExpression, by the SDC invariant `sdc-inv1`.
  - `isQueryLanguage(language)`: whether a language is either x-fhir-query code.
- The types of core's name analysis (API stages B, B2, C and D), which `RuleContext`'s `referencesAt`, `variablesAt`, `declarations`, `dependenciesOf` and `useOf` give:
  - `VariableReference`: one `%name` reference, with its `name`, its range as written (`startOffset`, `endOffset`), `complete`, which is false after a `defineVariable` with a computed name, and `conditional`, which is true where fhirpath.js may skip evaluating it (API stage D).
  - `AvailableVariables`: the `variables` available at a site, and `resolve(name)`, the `Variable` a reference gets: its `name`, its `origin` (`declaration`, `builtin`, `assembled` or `host`) and, for a declaration, the `Declaration`.
  - `Declaration` and `DeclarationKind`: a declaration's name, kind, pointer, item, use cases and declaring site.
  - `Dependencies`: what a declaration's expression references: `on`, the declarations its references resolve to, each once, in the order of their first reference; `analysed`, whether its references were found; and `known`, whether `on` is all of them, which a reference after a `defineVariable` with a computed name prevents.
  - `DeclarationUse`: whether the expressions of others reference a declaration: `referenced`, `unreferenced` (`sdc/unused-declaration`'s condition), or, when an expression that could reference it was not analysed, `blocked` (only expressions with a syntax error) or `unknown`.
- `definerOf(name)` and `BuiltinDefiner` (API stage C): the specification that defines a name, `FHIRPath`, `FHIR` or `SDC`, or `undefined`. `sdc/reserved-name` reports a declaration by it, so a plugin rule stays silent on such a name without a copy of core's list.

`referencesAt(site)` is `undefined` when the site has no FHIRPath analysis: its language is not `text/fhirpath`, it has no text, or the text does not parse. It is `[]` when the text parses and references nothing. `variablesAt(site)` is `undefined` at an uncatalogued site. `readsInput(site)` is whether the expression's value can differ between two inputs that share their linkId, such as two repetitions of a group: some term is evaluated with the input as its focus, other than to read its `linkId`, or the expression uses `%context`. It is syntactic, not proof that a value differs, and `undefined` where `referencesAt` is. The three are `undefined` for an object that is not one of `ctx.sites`, and `dependenciesOf` and `useOf` for one that is not one of `ctx.declarations`. A rule treats `undefined` as "cannot check", never as "no references". The list of built-in names is not exported: a rule reads `origin`, or `definerOf`.

`ctx.declarations` holds every declaration in the document, in document order, frozen: the array core's own rules use. Each `Variable.declaration` that `variablesAt` gives is one of its elements, and each declaration's `site` is one of `ctx.sites`. The `item` of a launchContext or extractAllocateId declaration is a different object from `site.item` for the same item, so a rule compares items by `pointer`.

A plugin rule that stays silent where a core rule reports the same root cause checks the condition with these lookups, never whether that rule ran.

## Inside the Smart Forms plugin

`packages/plugin-smart-forms/src` builds on these exports only ([smart-forms-rules.md](smart-forms-rules.md#shared-plugin-infrastructure)):

- `index.ts`: the plugin, its default export: its meta, its nine rules, its compatibility matrix (`compat`: the verified renderer, populate and template-extract versions; renderer and populate required) and the `hostVariables` hook. This is what core validates.
- `facts/`: the runtime facts, each with its evidence and the upstream issues that report it as a Smart Forms bug. Renderer and populate facts are keyed by component and version; template-extract facts by its version alone. The rules, `eligibility.ts`, `population.ts` and `stored-names.ts` consult them; the JSON readers know no facts.
- `eligibility.ts`:
  - `requireCompat(ctx)`, the selected renderer and populate versions, which each rule reads first, and `templateExtractVersion(ctx)`;
  - `readBy(ctx, site)`, a site's readers;
  - `storesVariable`, whether a component stores a variable's name.
- `document.ts`: reading the Questionnaire JSON behind a site; `urls.ts`: the extension URLs and the language codes.
- `launch-contexts.ts`, `source-queries.ts` and `templates.ts`: the readers of root launchContexts, root sourceQueries and the templates template extraction uses.
- `population.ts`: the [population model](smart-forms-rules.md#population), built for one document and compat: whether population runs, the sourceQueries it binds, what it binds for each declaration and when, what binds a name, and whether it reads an itemPopulationContext.
- `stored-names.ts`: `storedName`, the names each component stores, over the population model and the renderer's variables.
- `host-variables.ts`: the `hostVariables` hook, an adapter over the population model's sourceQueries.
- `rules/`: one module per rule, plus `language-sites.ts`, the site predicates the language rules share.

## Tests

Rules are tested with [lint cases](lint-cases/index.md), which the private `packages/lint-cases` package compiles with SUSHI and lints; Smart Forms runtime facts have reproduction tests against the pinned packages. [AGENTS.md](../AGENTS.md#tests) describes the layout, and [adding-a-rule.md](adding-a-rule.md) how to test a rule.
