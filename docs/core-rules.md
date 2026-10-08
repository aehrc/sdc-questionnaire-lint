# Core rules plan: the nine remaining `sdc/` rules

Builds the core rules from [core-plan.md](../core-plan.md) §4.1 that do not exist yet. Reviewed on 2026-10-08. The agreed corrections are part of this plan, and its overrides of core-plan are recorded in [plan-amendments.md](../plan-amendments.md). Decision IDs D1–D24 are stable because other docs cite them.

Already built: `sdc/parse-error`, `sdc/fragment-parse-error`, `sdc/query-syntax`, `sdc/unknown-function`, `sdc/uncatalogued-expression`.

## How to work on a slice

1. Pick the next slice in the [slice table](#slices-at-a-glance) whose status is `todo` and whose dependencies are done.
2. Read the slice section, every decision it cites (Dn), and the [GLOSSARY](../../GLOSSARY.md) terms it uses. Use the [Reference](#reference-specification-and-runtime-facts) section only when a case is not covered by a decision.
3. If the slice has an [open item](#open-items), ask the user to settle it before the PR merges.
4. Complete the [checklist for every slice PR](#checklist-for-every-slice-pr), then set the slice's status to `done`.

## Slices at a glance

One PR per slice, in this order. The exception is slice 4, which is three PRs.

| Slice | Delivers | Default severity | Depends on | Status |
| :- | :- | :- | :- | :- |
| [0](#0-corpus) | Local corpus and the command that compares its findings | – | – | done |
| [1](#1-language-rules) | `sdc/language-not-in-value-set` | warning | 0 | done |
|  | `sdc/language-not-allowed` | error | 0 | done |
| [2](#2-sdcexternal-expression) | `sdc/external-expression` | info | 0 | done |
| [3](#3-declarations-and-sdcduplicate-declaration) | Declarations, `sdc/duplicate-declaration`, suppressions that target declarations | error | 0 | done |
| [4a](#4a-variable-references) | Variable references (no findings) | – | – | done |
| [4b](#4b-available-variables) | Available variables and the `hostVariables` config key | – | 3 | done |
|  | `sdc/reserved-name` | error | 0, 3 | done |
| [4c](#4c-sdcundefined-variable) | `sdc/undefined-variable` | error | 0, 3, 4a, 4b | done |
| [5](#5-sdcshadowed-declaration-and-sdcdependency-cycle) | `sdc/shadowed-declaration` | info | 4c | todo |
|  | `sdc/dependency-cycle` | warning (D21) | 4c | todo |
| [6](#6-sdcunused-declaration) | `sdc/unused-declaration` | warning | 4c | todo |
| [7](#7-sdcunresolved-linkid) | `sdc/unresolved-linkid` | warning (D6) | 0 | todo |

These severities are the core-plan defaults, with the amendments applied. The changes from §4.1's error defaults are `sdc/dependency-cycle` (D21) and `sdc/unresolved-linkid` (D6, D7).

## Checklist for every slice PR

- The rule has `meta.docs`, written with the `explain` template.
- The rule has focused tests. Reuse the reporter tests; a rule does not need its own text and JSON snapshots. Keep targeted integration fixtures for fragment offsets, related locations, declaration targets and suppressions. Include patterns the corpus lacks.
- Completion is assessed for each of the rule's applicable targets (see [Shared analysis](#shared-analysis-and-completion-evidence)).
- The corpus has been run locally, and the PR description lists the findings that were added or removed, by rule ID, count and JSON Pointer, without expression excerpts from forms whose terms restrict redistribution (D14). A rule that reports at error merges only with zero false-positive errors on the corpus.
- `npm run check` passes.

## Principles

- Core checks the SDC specification. Where SDC versions differ, follow STU4 and the current build. Where Smart Forms behaves differently from the specification, the Smart Forms plugin reports it, not core ([Plugin follow-ups](#plugin-follow-ups-not-in-this-plan)).
- The linter serves any IG. Each decision must hold for any IG, not just one, and each rule is checked against forms from several sources (slice 0).
- If specification statements conflict, core reports no error. Record the conflict as an open item; runtime behaviour does not settle it.
- Messages use author terms. For example, a message says a name "is not available on this item".
- A clean corpus run is evidence about the forms it contains, not proof of zero false positives on other forms (D7).

## Shared analysis and completion evidence

This work cuts across slices 3, 4, 6 and 7. Add each piece in the slice that first needs it.

**One internal analysis per document** (D15, D18):

- Its inputs are explicit: the Questionnaire document, its existing expression sites and the configured `hostVariables`. Keep declaration discovery, parsed references and name resolution inside this internal module. Avoid a global cache keyed only by the document: it hides the host configuration and finds sites again with different object identities.
- `lint.ts` keeps the analysis for each document. `runRules` receives it explicitly and passes it to core checks through an internal argument. External plugin checks keep the current public `RuleContext`.
- Do not publish `Declaration`, `Variable`, `AvailableVariables` or variable references until a concrete plugin rule needs them. Keep the public `Scope`/`scopeAt` stub, which stays documented as unavailable.

**Completion evidence** is recorded for each rule and target, including the reason an applicable check could not run:

- Coverage and suppression assessment read the same evidence, but each answers a different question. A site is unchecked if an applicable, enabled check did not complete. A suppression is stale only if its own rule completed at its target.
- An uncertain linkId check must not block assessment of a completed `sdc/unknown-function` check on the same site.
- Keep the distinctions in report-format.md:
  - A site with no applicable linkId reference is not an unchecked limitation.
  - A rule that is configured off does not reduce coverage.
  - An established syntax error that blocks dependent checks gets the report's invalid-expression treatment.
- Do not add a public plugin framework for completion.

## Slices

### 0. Corpus

Implements D14.

- `corpus/` is listed in `.gitignore`, and nothing under it is committed. Copy these forms into it, and record each file's origin, commit or version, and licence terms in a local `corpus/SOURCES.md`:
  - the 27 standalone Questionnaires at Smart Forms commit `7e64a22f`, including its GP CCMP snapshot and the ATSI form;
  - the current GP CCMP build: the SUSHI output of `../gpccmp-fhir-ig` at a recorded commit;
  - the SDC IG STU4 example Questionnaires.
- Add a local command, which is not part of `npm run check`. It lints `corpus/` with the built-in rules, compares the findings with a snapshot kept in `corpus/`, and prints the findings that were added or removed. When `corpus/` is missing, it exits with a message.

**Done when** the command runs and every current finding has been reviewed and is a true positive. More forms can be added later; that work does not block the other slices.

### 1. Language rules

Decisions: D3, D10, D11.

- `sdc/language-not-in-value-set` (warning) reports an Expression whose language is not one of the six R4 and R5 codes. It checks every site that has a language, whether catalogued or not.
- `sdc/language-not-allowed` (error):
  - Only two catalog entries get the optional restriction to FHIRPath or CQL: enableWhenExpression and answerOptionsToggleExpression. Entries without a restriction need no language list.
  - Skip `application/x-fhir-query` on enableWhenExpression, because its Validator invariant already rejects it.
  - This rule checks `text/x-fhir-query` on enableWhenExpression, either query language on answerOptionsToggleExpression, and any other language these two locations do not allow.
- Add one shared predicate that recognises both `application/x-fhir-query` and `text/x-fhir-query`. Use it in dispatch, fragment discovery, the query checks and coverage. Reports show the language code as written.
- The help message never suggests replacing an R5 query code just because it is the R5 spelling. At a location that does not allow queries, it never suggests the R4 query code as a fix: the R4 query code is not allowed there either.
- Tests: pair the query tests with fragment tests for both query codes. Once slice 4 lands, add a test for an undefined name inside an R5 query fragment.

**Done when** both rules report as specified, and every query check and fragment check handles both query codes.

### 2. `sdc/external-expression`

- Info: the Expression has a `reference` but no `expression` text, so its content is not checked.
- Resolving and analysing the referenced Library content is out of scope.

### 3. Declarations and `sdc/duplicate-declaration`

Decisions: D9, D12, D15, D16, D17, D20, D22, D23.

**Declarations** go in a new file, `analysis/declarations.ts`:

- `findDeclarations(document, sites)` returns `Declaration { name, kind, pointer, item?, useCases, site? }` in document order.
- There are five kinds:
  - `variable`
  - `itemPopulationContext`
  - `namedExpression`: any catalogued expression that has a `name` (D9)
  - `launchContext`
  - `allocateId`: the `valueString` of each `sdc-questionnaire-extractAllocateId` extension on the root or an item; its use case is extraction (D17)
- The results of sourceQueries are host variables, not declarations (D16).
- launchContext names come from the `name` sub-extension of the root `sdc-questionnaire-launchContext` extension:
  - Read `valueCoding.code`. Accept `valueId` too, for legacy ballot compatibility; Smart Forms reads `valueId ?? valueCoding.code`.
  - A launchContext is not an Expression, so it has no site. The declaration's pointer is the extension.
  - Its use cases are rendering and population (D12).
- The owning element is the site's item. When the site has no item, it is the root of the site's resource.
- Ancestors come from item pointer prefixes. Compare with a trailing `/`, so that `/item/1` is not treated as a prefix of `/item/10`. `SiteItem` gets no parent chain.
- Contained resources declare nothing, because their sites are uncatalogued.
- `Declaration` and the declaration list stay in the shared analysis. Do not export them from `index.ts` or add them to `RuleContext` (D15).

**Site and catalog changes**:

- Align the use cases in the extension catalog with the SDC table (D20). Update `expression-sites.test.ts`, the `ExpressionUseCase` comment and the catalog description in architecture.md.
- The walker sets `declares` on each site as `catalogued && carrier === 'expression' && name !== undefined`. This replaces the per-entry catalog flag, which then has no users; remove it.
- Update the ExpressionSite comments, and the descriptions of declarations in architecture.md and the glossary. Keep the public Scope terminology (D15), and add allocateId to the glossary's **Declaration** entry.
- `baseKey` includes the name only when `site.declares` is true. Named expressions that become declarations can therefore change existing finding fingerprints. Test and document this one-time change; do not promise that fingerprints stay the same across it.

**`sdc/duplicate-declaration`** (error):

- It reports two declarations of any kinds with the same name on one element. The finding points at the later declaration and gives the other as a related location.
- `RuleFinding` gains `relatedLocations`, which maps to the report's existing `relatedLocations` field. This changes the plugin contract.
- A declaration whose name collides with a reserved built-in name needs its own check, separate from a duplicate between two user declarations. A forbidden declaration must not quietly take the place of the built-in. That check is `sdc/reserved-name`, built in slice 4b (D23).

**Suppressions that target declarations** (D22) must exist before any finding is reported on a launchContext or allocateId pointer:

- A suppression entry whose `extensionUrl` is launchContext or extractAllocateId selects declarations, not Expression sites. For example, to suppress two launchContexts named `patient` on the root:

  ```json
  { "rule": "sdc/duplicate-declaration", "file": "…", "extensionUrl": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext", "name": "patient", "reason": "…" }
  ```

- Record completion evidence for these rules by element and name, so that the stale-suppression check works.
- Update cli.md, the selector, the assessor and fingerprints. Represent these declarations directly; do not invent Expression sites for extensions that are not Expressions.
- Test pairs where neither declaration has an Expression site, and mixed pairs where one has.

**Tests**: root, item and nested declarations; every kind; launchContext with each value type; contained resources; Bundle entries.

### 4. Available variables, and `sdc/undefined-variable`

There are three PRs. 4a adds no findings, so it can land before the corpus exists. 4b adds `sdc/reserved-name` (D23). 4c needs the corpus.

#### 4a. Variable references

Decisions: D18.

- Add `findVariableReferences(text)` to `analysis/fhirpath.ts`, beside `findFunctionCalls`. It walks the `ExternalConstantTerm` nodes and returns `{ name, start, end }`, with offsets into the text.
- Each spelling reduces to the name fhirpath.js looks up:
  - `%a` is `a`.
  - `` %`a b` `` is `a b`, taken verbatim with no escape decoding.
  - `%'a'` is the string's value, with escapes decoded.
- The range covers the written `%`, any whitespace or comments after it, and the name's delimiters:
  - Convert the term's start and the end of the identifier token to offsets.
  - For a name written as a string literal, scan the text, skipping comments and respecting quoted escapes.
  - `ExternalConstantTerm.length` does not give the end (see [fhirpath.js](#fhirpathjs-4101)). A text search can also match the quoted name inside a comment.
- `defineVariable('y', …)` binds `%y` only in the later steps of its own chain:
  - Both `defineVariable('y', %y).select(%y)` and `defineVariable('y', 1).select(%y) | %y` throw when `y` is not otherwise defined, so do not exclude every `%y` in the expression.
  - Track the supported chain exactly, or mark the affected references incomplete. References with computed names are incomplete too.
  - Parsing successfully does not by itself mean name resolution completed.
- An expression that does not parse has no references.
- Compute the references once per document, in the shared analysis, and share them between the core rules and completion assessment. Design a public contract only when a plugin rule needs it (`flat-variable-context`, `named-expression-not-referenceable`).
- Tests:
  - each spelling, and keyword names;
  - whitespace and comments after `%`, and a comment that contains the quoted name;
  - ranges across lines, including CRLF line endings;
  - references in both query codes;
  - a reference in a `defineVariable` initializer and in a separate branch;
  - nested and parenthesised terms.

#### 4b. Available variables

Decisions: D1, D8, D12, D13, D15, D19.

Add a new file, `analysis/available-variables.ts`. The available variables are built once per document in the shared analysis, using the configured `hostVariables`. The sketch below is internal; it changes neither `RuleContext` nor the package exports. A site alone determines its available variables, so the resolver takes no use-case parameter:

```ts
interface Variable {
  name: string;
  origin: 'declaration' | 'builtin' | 'host';
  declaration?: Declaration;
}
interface AvailableVariables {
  variables: readonly Variable[];
  resolve(name: string): Variable | undefined;
}
// Internal document analysis; completion is recorded per rule and target separately.
variablesAt(site: ExpressionSite): AvailableVariables;
```

`resolve()` applies the innermost-wins rule and the `vs-` and `ext-` prefixes, so each rule gets them without reimplementing them.

**What a site can reference**:

1. Declarations on the site's element, in any order (D8), then on each ancestor item, then on the root. The innermost declaration of a name wins, because SDC says the descendant declaration overrides.
   - At an extraction site: only extractAllocateId names and named extraction contexts.
   - At any other site: every other kind of declaration, whatever the use cases of the declaring expression (D12, D13).
2. The built-in names in the table below. These are available at extraction sites too (D19).
3. The names in `hostVariables` (D1), at every site, extraction sites included.

| Built-in name | Available at | Defined by |
| :- | :- | :- |
| `resource`, `rootResource` | every site | FHIR |
| `context`, `ucum` | every site | FHIRPath |
| `questionnaire` | every site | SDC |
| `qitem` | sites on an item | SDC |
| `sct`, `loinc`, and the `vs-` and `ext-` prefixes | every site | FHIR |
| `terminologies` | base FHIR contexts | FHIR R4/R5 terminology API |
| `factory`, `server` | R5 base FHIR contexts; draft APIs | FHIR R5; fhirpath.js supplies `factory` itself |

- [FHIR R5 defines `%server`](https://hl7.org/fhir/R5/fhirpath.html#api), so it exists. Its methods are not yet supported: `sdc/unknown-function` exempts calls only on `factory` and `terminologies`. Coordinate with that rule before treating `%server`'s methods as supported.
- A fragment can reference whatever its containing expression can. It shares the query's item and use cases, so it is an extraction site only when its query is one.
- At an uncatalogued site, name analysis cannot run. Record that in the completion evidence. An empty variable list does not mean the analysis ran.

**`sdc/reserved-name`** (error, D23): reports a declaration of a name that FHIRPath, FHIR or SDC reserves. Specify it in this slice, from the built-in names in the table above.

**Config**: add `hostVariables`, a non-empty array of unique, non-empty names written without `%`. Check uniqueness explicitly, because the validation used for `files` does not. Update `LintConfig`, `knownKeys`, the config tests and the CLI configuration documentation.

**Tests**:

- Core-rule test support uses the shared analysis. The existing `scopeAt` fake used by the plugin-interface tests moves to one shared place.
- A table-driven resolution test covers:
  - ancestor overrides;
  - host names;
  - fragments;
  - contained resources;
  - extraction sites (D19);
  - names declared by expressions with other use cases (D13), including a reference from rendering to a named initialExpression, and references from descendant initialExpressions to a candidateExpression.

**Docs**: describe the internal pipeline in docs/architecture.md, and keep the public `Scope`/`scopeAt` contract as it is. Rename the glossary terms when that contract is redesigned for a plugin.

#### 4c. `sdc/undefined-variable`

Decisions: D2, D13, D19, D24.

- Error: a reference does not resolve at its site.
  - Example message: `%weigt is not available on item "BMI" (bmi).`
  - Example help: `a variable with a similar name is available: %weight`.
- Suggest a name with `closestName`, choosing only from names available at the site. `weigt` is one edit away from `weight`, so it gets a suggestion; the transposition `weigth` does not.
- The message describes the name only. It does not say the reference will be evaluated, or that a calculation will be left empty.
- Completion: the site is catalogued, its FHIRPath parses, and local-name handling completed for the affected references. Read the internal per-rule outcome. A successful parse, or a literal `defineVariable` name alone, does not prove completion.
- `examples/health-check` uses `%patient` without a launchContext. Add a launchContext so the example does not start reporting an error, and update `examples.test.ts` and the example's README.
- This slice has no pass for unused host variables, and no stub rule, fingerprint or report-schema handling for them (D2).
- Add the test slice 1 deferred: an undefined name inside a `text/x-fhir-query` fragment.
- The names a module lists in assembleContext are available throughout it (D24).

**Done when** the corpus run shows zero false-positive errors.

### 5. `sdc/shadowed-declaration` and `sdc/dependency-cycle`

Decisions: D13, D19, D21. **Open item:** the scope of the launchContext name restriction.

- `sdc/shadowed-declaration` (info) reports a descendant that declares a name an ancestor or the root already declares. The related location is the ancestor's declaration.
  - The info default is a deliberate change from SDC's SHOULD-level warning; plan-amendments.md already records it.
  - Descendant shadowing of a launchContext name is reported like any other shadowing until the open item is resolved. It gets no additional error.
- `sdc/dependency-cycle` (warning):
  - Find the cyclic strongly connected components, including self-edges. Report each component once, at its first declaration in document order, with the others as related locations. Do not enumerate every simple cycle.
  - Resolve edges with the availability model (D13, D19).
  - The message states the dependency and its possible consequence: `Declarations %a and %b reference each other; updates may not reach a stable value.` Use singular wording for a self-edge.
  - The help says: `Break the dependency cycle or verify that these expressions reach stable values in the form filler.` A stable cycle can be deliberate; skipping a conditional branch is not the only way to avoid failure.
  - The graph establishes a syntactic cycle, not failure to initialize or converge. Keep warning severity even when the cycle has no conditional construct. Any future core error requires a separately specified, proven failure class with explicit runtime assumptions (D21).
  - Tests cover self-edges, components with more than two declarations, and cycles through lazy branches and unconditional expressions. They verify the factual message and warning severity; the rule does not evaluate expressions or simulate a form filler.

### 6. `sdc/unused-declaration`

Decisions: D4, D5.

- Warning: no reference resolves to a `variable` declaration, and every plausible consumer was analysed.
- Use resolution, not name matching: a reference to a shadowing declaration is not a use of the declaration it shadows.
- Report nothing when a plausible consumer is CQL, an Expression that has only a reference, an excluded whole-string carrier, or an unsupported case of local variables. A first, conservative version can skip the unused check for the whole document instead of building analysis across languages.
- Tests: an itemPopulationContext that is useful although nothing references it, and variables used only by opaque consumers.

### 7. `sdc/unresolved-linkid`

Decisions: D6.

- Warning: a literal linkId in a recognised pattern that demonstrably targets this Questionnaire or its response names no item anywhere in this Questionnaire.
  - Example message: `No item in this Questionnaire has linkId 'typo'.`
  - This is initially a preview check. A project can configure it as an error under an explicit authoring policy requiring literal linkIds to name existing items. An empty selection alone does not establish an expression error (D6).
- Start with a bounded, documented family of item selectors followed by `.where(linkId = '…')`. Include explicit `%questionnaire` and item-site `%qitem` targets, and `%resource` and valid `%context` targets for the response. Define the exact supported patterns at the start of the slice, using the corpus and the [selector facts](#literal-linkid-selectors).
  - Questionnaire selectors include `.item` and `.repeat(item)`; response selectors include `.item`, `.repeat(item)` and `.repeat(item | answer.item)`.
  - `%context` is the response root at root sites and the corresponding response item(s) at item sites. An implicit `item` or `repeat(item)` is supported only when its current input is established; nested functions can change that input.
  - `%qitem` is available only at item sites. Do not infer an item target from a root-site use.
- Check global item membership first. A linkId that exists elsewhere in this Questionnaire gets no unresolved-linkid finding even if the written selector searches the wrong depth or child path. Path correctness and general alias/provenance analysis are deferred.
- Prove that the selected items belong to this form. `descendants()` can cross into contained resources, so its root alone does not establish the target. Leave such a reference incomplete unless its item provenance is established.
- Exclude recognised deliberate absence probes, such as selectors consumed by `.empty()`, `.exists()` or a `count()` comparison, from findings. Treat these exclusions conservatively without attempting general intent inference. Runtime absence of an unanswered response item is not a missing Questionnaire linkId.
- A linkId reference with an uncertain target produces no finding and leaves this check incomplete. Examples are `%previousResponse`, computed linkIds and unsupported aliases.
- A site is not unchecked just because it matches none of the patterns. Pass the per-rule completion evidence to coverage and suppression assessment.
- Tests cover both target kinds, `%qitem` and root/item `%context`, nested groups and answer children, a known linkId searched at the wrong depth, contained resources, foreign responses, deliberate absence probes, and configured warning/error severity.

## Decisions

Each decision is listed under its topic and keeps its original number.

### Names supplied by the host

- **D1. Host variables.** A host variable is a name an expression references that the form does not declare, and that FHIRPath, FHIR and SDC do not define, but that the application running the form supplies at runtime (see the glossary). Examples are the `additionalContext` entries Smart Forms passes, and `%PrePopQuery`, the name Smart Forms gives a sourceQueries result (D16). A project lists its host variables by exact name in a new config key, `hostVariables`. They are available at every site in every use case.
  _Why:_ a form built for one host can use such a name in many expressions, and one suppression per expression does not scale. Because only exact names are accepted, typos in other names are still reported. Core reads a list and learns no host's conventions.
- **D2. Defer `lint/unused-host-variable`; keep the explicit `hostVariables` list.**
  _Why:_ a warning for unused entries needs a pass across documents and config-reporting machinery, with no evidence yet that it is needed. Adding the exact typo an expression already uses would get past that warning anyway.
- **D16. sourceQueries result names are host variables, not declarations.** Smart Forms names these results `%<contained Bundle id>`, or `%sourceQuery<index>` for a reference that is not contained. Core does not read sourceQueries, and these names take part in no declaration check; a project lists them in `hostVariables`. A plugin hook that lets the Smart Forms plugin supply them automatically is a plugin follow-up.
  _Why:_ SDC defines sourceQueries for StructureMap population and gives the results no FHIRPath name; the names are a Smart Forms convention. Declaring them in core would invent SDC errors, such as a duplicate-declaration error for a variable that shares the Bundle's id. It would also accept `%PrePopQuery` for engines that do not supply it. A plugin cannot yet tell core about a name, so the config list fills the gap until it can.

### Languages

- **D3. `sdc/language-not-allowed` skips restrictions the FHIR Validator already enforces.**
  _Why:_ core-plan §1.2. A project that needs them runs the Validator in CI.
- **D10. `sdc/language-not-allowed` enforces only the restrictions in the SDC expressions table, minus those the Validator enforces. contextExpression counts as allowing any language.**
  _Why:_ the table and the contextExpression definition contradict each other, and core reports no error on a contradiction.
- **D11. `sdc/language-not-in-value-set` accepts the R4 and R5 codes.**
  _Why:_ a Questionnaire does not state its FHIR version, and an IG can target R4 or R5. Smart Forms ignoring R5's query code belongs to `smart-forms/unsupported-expression-language`.

### Declarations and availability

- **D8. A variable can reference a variable declared later on the same element, and core does not report it.**
  _Why:_ STU4 says "tools cannot rely on this ordering". Smart Forms evaluates in order, which is a plugin follow-up.
- **D9. Any expression with a `name` at a catalogued location declares that name, not only `variable` and `itemPopulationContext`.**
  _Why:_ the SDC FHIRPath supplements say "All expressions that specify a 'name' can be accessed by other expressions appearing on the same item or any descendant item". Without this, valid forms would get false `sdc/undefined-variable` errors.
- **D12. launchContext names are available at every site except extraction sites (D19).**
  _Why:_ the population guidance allows launch-context variables in any expression, and the $extract guidance excludes launchContext. These statements are broader and more direct than the recommendation to use external data mainly in initialExpression and calculatedExpression.
- **D13. A name is available at every non-extraction site on its declaring element and that element's descendants, whatever the use cases of the declaring expression.** Use cases restrict availability only for extraction (D19).
  _Why:_ SDC states availability by element (see [Visibility](#visibility)). The table's use cases say which SDC feature uses an extension, not when a name exists. Whether a runtime computes the value in time is the plugin's concern.
- **D17. An `extractAllocateId` name is a declaration that is available in extraction only.** `sdc/unused-declaration` does not report it (D4).
  _Why:_ SDC $extract lists these names as available during extraction; without them, every use would get a false error.
- **D19. Extraction sites.** An extraction site is a site whose only use case is extraction. It can reference the extractAllocateId names and named extraction contexts on its element and its ancestors, the built-in names and the host variables (D1). Every other site can reference every other declaration on its element and its ancestors. After D20, no catalogued site has extraction together with another use case. So `sdc/undefined-variable` reports a reference that does not resolve at its site, without combining results across use cases. Definition-based and template-based extraction follow the same rule.
  _Why:_ the explicit $extract statements (see [Extraction](#extraction)) override the table's `all` label, which names the features that use an extension. FHIRPath and FHIR define their built-in names for every context; where SDC's "only" list disagrees, core reports no error.
- **D20. The use cases in the extension catalog follow the SDC expressions table.** `behavior` is rendering; `population` is population, including continuous population while the form is edited; `all` is rendering and population; the $extract extensions are extraction. As a result, initialExpression gains rendering; candidateExpression, answerExpression and contextExpression become population; and variable loses extraction. cqf-expression is not in the table, so it stays rendering.
  _Why:_ core checks the specification. The current entries follow Smart Forms' evaluators, which belong in the plugin's compatibility matrix. Nothing reads use cases yet, so only the catalog, its tests and the glossary change.

- **D24. assembleContext names are supplied names, not declarations.** Each `valueString` of an `sdc-questionnaire-assembleContext` extension on a Questionnaire's root is available at every catalogued site of that Questionnaire, extraction sites included, after the built-in names and before the host variables. It is not a declaration, so `sdc/duplicate-declaration`, `sdc/reserved-name`, suppressions that target declarations (D22) and fingerprints do not apply to it. Decided on 2026-10-08, during slice 4c.
  _Why:_ SDC modular forms require a module to list every name the including Questionnaire must supply in assembleContext, "to allow validating these subQuestionnaires independent of their inclusion in a parent", so any other undeclared name in a module is still an error. The extension states a requirement on the parent and is dropped by $assemble; SDC's own module example redeclares such a name on an item, which a root declaration would make a shadowing case. The parent may supply the name as a variable, which extraction cannot see, or in a form it can, so core reports no error at an extraction site (D19). Checks of the names themselves, such as a reserved or unused assembleContext name, are left to a later rule.

### Rule behaviour

- **D4. `sdc/unused-declaration` reports only `variable`.** It excludes itemPopulationContext, launchContext, allocateId and other named expressions.
  _Why:_ an itemPopulationContext can create repeating groups without any reference to its name, and the other kinds also have purposes that need no reference to their names.
- **D5. A variable is unused only when no reference in the Questionnaire resolves to it, and every plausible consumer was analysed.** References inside `{{…}}` fragments count. A reference in any supported use case counts as a use.
  _Why:_ when a consumer is not supported, finding no reference in it does not prove the variable is unused.
- **D6. `sdc/unresolved-linkid` defaults to warning and checks bounded patterns targeting this Questionnaire or its response.** Initially check whether a literal names any item in the Questionnaire; defer path correctness and general alias analysis. Exclude recognised deliberate absence probes conservatively. A project may configure error severity under an explicit policy requiring existing item names. A reference whose target is uncertain, such as `%previousResponse`, produces no finding and leaves the applicable check incomplete; its site is counted in `expressions.unchecked`.
  _Why:_ Questionnaire targets are part of core-plan §4.1. A known target and an absent literal do not prove author error: a reusable expression can intentionally test for absence. A broad traversal can also reach another resource's items. Warning severity and bounded target recognition preserve useful checks without claiming runtime failure, and an author cannot act on an "unchecked" finding.
- **D7. New rules keep the default severities in core-plan §4.1, with the amendments applied.** The changes from error to warning are `sdc/dependency-cycle` (D21) and `sdc/unresolved-linkid` (D6).
  _Why:_ a reviewed corpus is evidence about precision, but it does not prove zero false positives on forms it does not contain.
- **D21. `sdc/dependency-cycle` defaults to warning, not error.** Report syntactic cyclic components with factual dependency wording and possible failure to stabilize. Absence of conditional constructs is not sufficient evidence for an error. Any future core error requires a separately specified, proven failure class with explicit initialization and scheduling assumptions. Build no symbolic evaluator. This overrides the error severity in core-plan §4.1.
  _Why:_ SDC allows iterative updates that reach stable values. `iif(false, %self, 1)` returns `[1]`, and unconditional cycles can stabilize, oscillate or grow under supplied bindings. Missing initial bindings can instead fail before iteration starts. The [cycle probes](#fhirpathjs-4101) establish engine results under a simulated scheduler, not a form filler's initialization behavior. A reference graph alone cannot distinguish these outcomes.
- **D22. Suppressions can target declarations.** A suppression can target a declaration that has no Expression site, by element and name, using the existing keys:
  - `extensionUrl`: the launchContext or extractAllocateId extension;
  - `name`;
  - `linkId` for an item, or no `linkId` for the root. Use `pointer` for an item that has no linkId.
  The suppression hides the rule's findings for that name on that element. It is stale when the name is no longer declared there, or when the rule completed there with no finding.
  _Why:_ a duplicate launchContext or allocateId has no Expression site, so the current suppressions cannot reach it. The error would then fail CI, and the only way out would be to turn the rule off. An element plus a name survives reordering and needs no new config keys.
- **D23. A declaration of a reserved name is reported by `sdc/reserved-name`, at error, built in slice 4b.** Decided on 2026-10-08, settling the open item that blocked slice 3. `sdc/duplicate-declaration` compares only declarations in the form.
  _Why:_ redeclaring a name FHIRPath, FHIR or SDC reserves is a different mistake from declaring a name twice, with a different fix. The check needs the built-in name list that slice 4b defines for available variables.

### Process and architecture

- **D14. The corpus is local.** A corpus of real forms is copied into the gitignored `corpus/` directory and never committed. A local command lints it and compares the findings with a local snapshot. The PR author runs it and reports the changes in findings in the PR, by rule ID, count and JSON Pointer, without expression excerpts from forms whose terms restrict redistribution.
  _Why:_ every rule change is checked against real forms before it merges, and tests need no network. Each source's own terms allow this local use: Smart Forms is Apache-2.0, ATSI 0.4.0 is CC BY-SA 4.0, the SDC IG examples are CC0-1.0, and GP CCMP permits evaluation and local testing only, with no redistribution. Some forms state no terms. Leaving the corpus uncommitted keeps every redistribution term untouched. CI cannot run the corpus.
- **D15. Declarations, references and the resolution of available variables stay internal until a plugin rule needs them.** New analysis uses the term **available variables**. The public `Scope`/`scopeAt` replacement and the matching glossary rename are deferred.
  _Why:_ one shared internal module gives the core rules consistent facts, without expanding or renaming the plugin interface too early.
- **D18. Variable references stay internal to core, and `RuleContext` does not expose them yet.**
  _Why:_ no plugin rule needs them yet, and adding them to the contract later breaks nothing.

## Open items

| Item | Blocks |
| :- | :- |
| Clarify whether the broad restriction on launchContext names overrides the general permission for descendants to shadow a name ([Visibility](#visibility)). | Any error for descendant shadowing of a launchContext name in slice 5. |
| Reconcile the older CQL shorthand in the expressions table with STU4's explicit guidance on `text/cql-identifier` and `text/cql-expression`. Until then, behave conservatively: `sdc/language-not-allowed` does not reject those codes just because they are newer spellings. | Nothing; slice 1 behaves conservatively. |
| Choose the linter's own licence (MIT or Apache-2.0) before the repository goes public or a package is published. There is no LICENSE file and no `license` field in the package. | Publishing only. |

## Plugin follow-ups (not in this plan)

- A plugin hook for supplied names. With it, the Smart Forms plugin supplies its own host variables: the sourceQueries result names it reads from the form (`%<Bundle id>`, `%sourceQuery<index>`), and its `additionalContext` names. Core's resolution then accepts names from `hostVariables` and from plugins alike, still without knowing any host's conventions (D1, D16).
- An eagerly evaluated reference to a later variable can fail in Smart Forms when there is no earlier binding that was supplied or fetched (D8). Tell this apart from lazy branches, and from x-fhir-query contexts that are fetched first.
- Smart Forms ignores `text/x-fhir-query` (D11). This belongs in `smart-forms/unsupported-expression-language`.
- sdc-populate skips item variables when the Questionnaire root has no extensions.
- Template-extract evaluates no Questionnaire `variable`s, as SDC $extract specifies (D19). This is not a compatibility gap.
- The renderer sees itemPopulationContext names only through populate's `additionalContext`. A reference that SDC allows (D13) can therefore be empty when the form is rendered without populate. This belongs in `smart-forms/named-expression-not-referenceable`.
- The renderer's answerExpression fallback supplies only the first parsed launch or query name, so a second name the form supplies can fail. Built-in names can still resolve.
- Several renderer and population paths use `{}` for `%context`; root and item variable evaluation are exceptions. Match the evaluator responsible, rather than rejecting every use of `%context`.

## Out of scope

- Whole-string FHIRPath carriers: `questionnaire-constraint` and the templateExtract `valueString` extensions.
- The content of `sourceQueries` Bundles, and the Library content behind `Expression.reference`.
- CQL analysis (core-plan §1.3).

## Reference: specification and runtime facts

These facts were checked on 2026-10-08 against:

- SDC STU3 and STU4, and the SDC current build;
- the R4 and R5 core specifications;
- the FHIR extensions pack 5.3.0;
- Smart Forms commit `7e64a22f32129b36660392738b8541e8876d931d` (renderer 1.4.0, populate 4.7.1, template-extract 1.0.15).

Where specification statements conflict, the conflict is listed as an open item instead of being settled from runtime behaviour.

### Visibility

Source: [SDC STU4 expressions](https://hl7.org/fhir/uv/sdc/STU4/en/expressions.html).

- A variable "is available for use in expressions within the same item and any descendant items", so variables declared on the root are visible everywhere.
- **Order on one element.** STU4 says tools cannot rely on the order of declarations, and that a reference still unresolved after all in-scope extensions are processed SHOULD be an error. The same release also says "subsequent expressions", and its population page evaluates root variables in order of appearance. The source is not consistent with itself; D8 follows the explicit guidance that tools make no assumption about order.
- "It is an error if the same variable name is assigned a value more than once in a single node."
- "If the same variable is assigned on both an element and a descendant element, a warning SHOULD be generated, however it is not an error. The descendant declaration SHALL be treated as overriding the higher-level declaration."
- launchContext sits on the Questionnaire root. Its names behave "as if the value had been set in a variable".
- Names reserved by FHIRPath, FHIR and SDC must not be redeclared; this is a separate matter from duplicate declarations on one element. It is still open whether launchContext also prohibits shadowing by descendants anywhere in the Questionnaire: the broad wording about launch names and the explicit permission for descendants to override have to be reconciled.
- **The table's use cases are not availability rules.** The table says "Use Cases: Indicates which of the SDC use-cases make use of the extension", and the use cases also select the expression-language feature code. initialExpression is `all`, and its value is set "upon the question first becoming enabled" as well as when the response is created. candidateExpression, answerExpression and contextExpression are `population`, and candidateExpression is "only invoked when the user is entering/editing the answer". The catalog follows the table (D20); availability follows D13 and D19.

### Languages

| Location | Allowed | What the Validator enforces |
| :- | :- | :- |
| enableWhenExpression | FHIRPath or CQL | Rejects `application/x-fhir-query` (`sdc-inv1`, `language!='application/x-fhir-query'`). R5's `text/x-fhir-query` passes it. |
| answerOptionsToggleExpression (`expression`) | FHIRPath or CQL | Nothing |
| targetConstraint (`expression`) | Any | Nothing in R4: only the R5 extensions pack 5.3.0 fixes the language to `text/fhirpath` |
| contextExpression | Contradictory: the table says any language, the definition says a FHIR query | Nothing |
| Every other catalogued location | Any | Nothing |

The language codes have an extensible binding:

- [R4](https://hl7.org/fhir/R4/valueset-expression-language.html): `text/cql`, `text/fhirpath`, `application/x-fhir-query`.
- [R5](https://hl7.org/fhir/R5/valueset-expression-language.html): `text/cql`, `text/fhirpath`, `text/x-fhir-query`, `text/cql-identifier`, `text/cql-expression`.

R5 replaces the R4 query code, so together they make six codes (D11).

### launchContext

Sources: the [definition](https://hl7.org/fhir/uv/sdc/STU4/en/StructureDefinition-sdc-questionnaire-launchContext.html) and the [codes](https://hl7.org/fhir/uv/sdc/STU4/en/CodeSystem-launchContext.html).

- The codes are `patient`, `encounter`, `location`, `user`, `study` and `clinical`.
- STU3 and STU4 use `valueCoding` with an extensible binding, which allows agreed custom names. GP CCMP declares `gpccmppractitionerrole`.
- `valueId` appeared only in the 2.7.0 ballot; STU3 and STU4 do not permit it.

### Extraction

- The expressions page says the other extensions "are not available during extraction". It says $extract FHIRPath expressions "only have access to" `%resource`, `%context`, `%questionnaire`, `%qitem` and extractAllocateId names "from parent items".
- The [extraction guidance](https://hl7.org/fhir/uv/sdc/STU4/en/extraction.html) says extraction has no access to "the launchContext, initialExpression, or variable extensions". It says a named template context "will be made available to any child property extraction expressions".
- extractAllocateId names apply on their own node and its descendants, not across sibling groups.
- The table labels variable and initialExpression `all` because of the features that use them; the explicit statements above decide availability (D19).

### Literal linkId selectors

These follow from the published structure ([FHIRPath N1](https://hl7.org/fhirpath/N1/), [R4 QuestionnaireResponse](https://hl7.org/fhir/R4/questionnaireresponse-definitions.html#QuestionnaireResponse.item.answer.item)); SDC specifies no linter algorithm. Slice 7 first checks global item membership only; the depth and child-path differences below matter for the deferred path check.

| Receiver before `.where(linkId = '…')` | Candidate items |
| :- | :- |
| `%questionnaire.item` | Direct root children only. |
| `%questionnaire.repeat(item)` | All Questionnaire items below the root. |
| `%qitem.item` at an item site | Direct children of that Questionnaire item. |
| `%qitem.repeat(item)` at an item site | Its descendant items, excluding `%qitem` itself. |
| `%resource.item` | Direct response children, which correspond to root Questionnaire items. |
| `%context.item` | Root response children at root sites; child response items at item sites. |
| `%resource.repeat(item)` | Only items reachable through `item`, not those nested under answers. |
| `%resource.repeat(item \| answer.item)` | Every response item, through both child paths. |
| `descendants()` on a proven resource root | Every descendant, including items of contained resources, so the root alone does not prove the items belong to this form. |

- A response item may be absent when unanswered; a reference to it returns an empty collection, not an error.
- `%qitem` is valid only at item sites. An explicit `%context` is the response root only at root sites.

### fhirpath.js 4.10.1

These facts were verified by running fhirpath.js on 2026-10-08.

- **Grammar.** The grammar is `externalConstant: '%' ( identifier | STRING )`. `identifier` also accepts `as`, `contains`, `in`, `is`, `asc`, `desc` and `sort`. The pinned parser rejects the backtick spelling of `sort`. The AST is `TermExpression > ExternalConstantTerm > ExternalConstant > Identifier`, except for `%'…'`, which has no `Identifier`.
- **Spellings and ranges.**
  - `` %`a` `` looks up the backtick text verbatim, and `%'a'` decodes string escapes.
  - `ExternalConstantTerm.length` excludes `%` and backticks, but includes the quotes of a name written as a string literal.
  - Whitespace and comments can separate `%` from the name, so the term's start plus its length is not a reliable range for what was written.
- **Lookup order.** fhirpath.js looks in the caller's variables, then the built-in names, then names from `defineVariable`.
  - A name that is not found throws when evaluated.
  - `iif(false, %nope, 1)` returns `[1]`. Functions given an empty input, such as `all`, `repeat`, `select` and `where`, may also skip evaluating their argument.
  - Boolean operators give no such guarantee: `false and %nope` throws.
  - A name defined with a null value gives `[]`.
- **Built-in names.**
  - Always supplied: `ucum`, `context` (the evaluation root) and `factory`.
  - `terminologies` only when a `terminologyUrl` is given.
  - `fhirServerUrl`, which is non-standard, only when a server URL is given.
  - `resource`, `rootResource`, `sct`, `loinc`, `vs-*` and `ext-*` throw unless the caller passes them.
- **`defineVariable('y', …)`** makes `%y` available only to later steps in its own chain, and throws if `y` is already a variable.
- **Cycles under a sequential scheduler.** These were simulated with supplied initial bindings, which says nothing about how a form filler initializes declarations:
  - `%b * 0` without a `b` binding fails as an undefined name.
  - `a = %b * 0`, `b = %a * 0` from `a = 7`, `b = 3` both become 0 and stabilize; from empty bindings they stay empty. `self = %self * 0` from 7 becomes 0.
  - `a = 1 - %b`, `b = %a` from zero oscillates between (1, 1) and (0, 0).
  - `a = %b + 1`, `b = %a + 1` from zero grows without bound.
- **Selectors.** Root `.item.where(linkId = 'weight')` misses a nested item that `.repeat(item)` finds. Only `repeat(item | answer.item)` finds a response item nested under an answer. `descendants().where(linkId = 'foreign')` finds an item of a contained Questionnaire. A missing-item selection followed by `.empty()` gives `[true]`. `%previousResponse` resolves against the response supplied for it, not this form.

### Smart Forms runtime

These facts matter for the plugin, not for core.

- Variables are evaluated in array order, in one flat namespace.
- **Forward references.**
  - An eagerly evaluated forward reference fails when the name is not in the supplied context.
  - Population fetches x-fhir-query contexts before FHIRPath variables, so a reference to one of those names is not necessarily a failing forward reference.
  - Renderer reevaluation can keep an earlier value.
  - A lazy branch may never access the reference at all.
- **Failures on undefined names** are caught. Renderer calculations can keep a previous value. Population can return OperationOutcome warnings, which the app can display. So a failure does not always leave an empty field with no visible feedback.
- No component supplies `%questionnaire` or `%qitem`.
- **Built-in names by component.**
  - Renderer and populate: `%resource`, `%rootResource`, `%factory`, `%terminologies`. Populate also supplies `%fhirServerUrl` when a source server is set.
  - Template-extract: `%resource`, `%rootResource`, `%factory` and allocateId names only. It evaluates no Questionnaire `variable`s.
- **Evaluation contexts.** Renderer root variables are evaluated against the QuestionnaireResponse. Item variables are evaluated against the response item, or `{}` when it is absent. Several other renderer and population paths evaluate against `{}`. See the [renderer evaluators](https://github.com/aehrc/smart-forms/blob/7e64a22f32129b36660392738b8541e8876d931d/packages/smart-forms-renderer/src/utils/fhirpath.ts#L258-L345).
- Launch resources can arrive through `additionalContext`. The answerExpression fallback also reads patient, user and encounter, and resolved launch references, directly. It supplies only the first `%name` in the expression. See the [fallback evaluator](https://github.com/aehrc/smart-forms/blob/7e64a22f32129b36660392738b8541e8876d931d/packages/smart-forms-renderer/src/hooks/useValueSetCodings.ts#L65-L100).
- **sourceQueries.** The result names are `%<contained Bundle id>`, or `%sourceQuery<index>` for a reference that is not contained. SDC defines sourceQueries for StructureMap population, not as FHIRPath bindings; the naming is a runtime convention, handled as host variables (D16).
- **x-fhir-query variables.** Populate evaluates only `text/fhirpath` variables. It fetches x-fhir-query variables as context parameters named after the variable. The renderer sets every x-fhir-query variable name to `[]` in advance, so referencing one never throws there.
- **x-fhir-query embeddings** start with `{{%launchName.…}}`. Populate evaluates the rest of the embedding against the launch resource, without the form's variable map. Built-in names such as `%context` and `%ucum` can still resolve in the rest of it. Populate also has other replacement limitations; reproduce one before a plugin check rejects an expression because of it. See the [embedding evaluator](https://github.com/aehrc/smart-forms/blob/7e64a22f32129b36660392738b8541e8876d931d/packages/sdc-populate/src/SDCPopulateQuestionnaireOperation/utils/createFhirPathContext.ts#L659-L729).

### GP CCMP at commit `a243b68`

- The form uses launch contexts, Questionnaire variables and itemPopulationContext names.
- The PractitionerRole declaration is inside a commented-out FSH block, so it is not an unused declaration in the compiled form.
- PostalAddressArray is declared by an itemPopulationContext and referenced by an enableWhenExpression on the same item. SDC makes the name available there, so core reports nothing (D13).
- Count references in the generated JSON, not in raw FSH comments. Counts that have not been verified do not justify D19.
