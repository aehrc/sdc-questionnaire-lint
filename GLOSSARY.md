# sdc-questionnaire-lint

Static checking of the expressions inside FHIR SDC Questionnaires, for form authors, CI pipelines and AI agents.

## Language

### Expressions

**Expression site**:
One expression the linter found in a Questionnaire, with where it is, what carries it and its use cases. Rules receive a document's expression sites as a flat list in document order.
_Avoid_: Expression location, occurrence

**Carrier**:
What holds an expression in a Questionnaire: an Expression object, a whole-string FHIRPath value, a `{{…}}` fragment embedded in an x-fhir-query, or an indirect reference to content elsewhere.

**Extension catalog**:
The linter's list of the SDC extensions that can hold an expression, with the elements each may sit on, its carrier and its use cases. Any Expression with a name at a catalogued location declares that name.
_Avoid_: Registry

**Catalogued location**:
A place in a Questionnaire that the extension catalog recognises, such as a variable or a calculatedExpression on an item. An expression site found anywhere else is uncatalogued, and only its syntax and function names can be checked.
_Avoid_: Registered location, known extension, supported path

**Use case**:
An SDC feature that uses an expression, as the SDC expressions table lists it: rendering (SDC form behavior, while the form is displayed and filled in), population (filling answers from existing data, when the form is created or while it is edited) or extraction (turning answers into other resources). A use case does not limit which names an expression can reference, except at an extraction site, a site whose only use case is extraction.

**Declaration**:
Something in a Questionnaire that introduces a name other expressions can reference as `%name`: any expression with a name at a catalogued location, such as a variable or itemPopulationContext, a launchContext, or an extractAllocateId. A sourceQueries result is not a declaration.
_Avoid_: Variable (one kind of declaration)

**Available variables**:
The names an expression can reference at its site; the site alone determines them. They are the declarations on its element, its ancestor items and the root, the innermost of a name winning (in a declaration's own expression, its own name means the next binding outward), plus the names FHIRPath, FHIR and SDC define, the names a module lists in assembleContext, and the host variables. An extraction site sees only extractAllocateId names, named extraction contexts, the built-in names, the assembleContext names and the host variables. Messages say a name "is not available on this item".
_Avoid_: Visibility, context (FHIRPath's `%context` is something else), scope

**Reference**:
One `%name` in an expression's FHIRPath, fragments included; it resolves to the available variable of that name at its site. A reference is complete unless an earlier step of its chain is a `defineVariable` with a computed name, which may bind it.
_Avoid_: Usage, variable use

**Built-in name**:
A name FHIRPath, FHIR or SDC defines, such as `%resource`, `%questionnaire`, `%qitem` or a name with the `vs-` or `ext-` prefix. Available at every site, except `%qitem`, which needs an item. A form must not declare one.

**Host variable**:
A name an expression can reference that the form does not declare and that FHIRPath, FHIR and SDC do not define, but that the application running the form supplies at runtime by its own convention, such as an entry in Smart Forms' additionalContext or `%PrePopQuery` for a sourceQueries Bundle. Listed by exact name in the config's `hostVariables`, or supplied by a plugin the config lists, such as the Smart Forms plugin for sourceQueries results; available at every site.
_Avoid_: Environment variable (FHIRPath's term for any `%name`), context variable

### Rules and findings

**Rule**:
One check over a Questionnaire's expression sites, identified by `<namespace>/<rule-name>` in config, suppressions, docs and reports.

**Plugin**:
A named, versioned set of rules. Core's rules form the built-in `sdc` plugin; the Smart Forms rules ship as a separate plugin.

**Namespace**:
The first part of a rule ID, naming the plugin that provides the rule. `lint` is reserved for findings about the linter's own configuration.

**Finding**:
One reported problem at one place in a Questionnaire or the linter's configuration, identified by a rule.
_Avoid_: Diagnostic, issue, violation, error (an error is a severity of a finding)

**Severity**:
How serious a finding is: error, warning or info. Only unsuppressed errors fail a lint run; `off` is not a severity but a rule setting.

**Rule off**:
A configuration choice that stops a rule from running anywhere. It is not a suppression.

**Rule set**:
The rules of one run: every rule of the built-in plugins and the configured plugins, each with its effective rule setting, the configured one or the rule's default severity.
_Avoid_: Registry, rule registry

### Suppressions and runs

**Suppression**:
A recorded decision, with a written reason, not to report one rule's findings at one expression, or at one declaration that has no expression, such as a launchContext.
_Avoid_: Exception, ignore, disable

**Stale suppression**:
A suppression established to be unnecessary after its target has been checked or confirmed to no longer exist. It is itself reported as a finding; a suppression whose target was not assessed is not stale.
_Avoid_: Unused suppression, dead suppression

**Full run**:
A lint run with no paths on the command line, which checks the config's `files` or the default directory. It can confirm that a file named by a suppression was deleted.

**Targeted run**:
A lint run with paths on the command line, which checks only those files. Suppressions for other files are not assessed.
_Avoid_: Partial run

### FSH sources

**SUSHI index**:
`fsh-generated/data/fsh-index.json`, written by SUSHI: for each output file, the FSH file and line range of the definition that produced it. It locates a definition, not an expression, and never lists inline instances.
_Avoid_: FSH index

**Inline instance**:
An FSH `Instance:` with `Usage: #inline`. SUSHI embeds it in another resource, as a contained resource or a Bundle entry, instead of writing it to a file of its own.

### Smart Forms compatibility

**Smart Forms**:
AEHRC's open-source SDC form stack, the runtime whose behaviour the Smart Forms plugin checks forms against.

**Supported integration**:
The way of running Smart Forms that the plugin's rules assume: population, which succeeds, then rendering; template extraction only when the compatibility target selects it. A renderer used without population, or a run where population failed, is outside it.

**Component**:
One independently versioned part of Smart Forms: renderer, populate or template-extract. A construct can work in one component and fail in another. A config's explicit compatibility target must name renderer and populate; template-extract is checked only when named.

**Compatibility matrix**:
What the plugin knows about each component: the versions it has verified, oldest to newest (`compat.verified` of the plugin), and the runtime facts its rules rely on. Each component's versions are verified independently, and any combination of verified versions is accepted.

**Compatibility target**:
The component versions a config checks against, set by `compat` and reported in `run.compat`. The default, `"smart-forms": "latest"`, means the newest versions the installed plugin has verified, not the newest on npm. An explicit target names exact verified versions; there is no fallback to a nearby one.
_Avoid_: Preset, supported versions

**Runtime fact**:
One thing a component does, for a version, that a plugin rule relies on, such as the languages it evaluates at a location or the names it supplies. Each fact carries its evidence: a reproduction test, or `source-only` with a permalink into the Smart Forms source, in which case a message claims only what the source shows. A fact does not name a rule.

**Reproduction test**:
A test that runs a pinned Smart Forms npm package on a minimal form to show a runtime fact, such as the queries sdc-populate sends.

**Reader**:
A selected component that reads an expression site, with how it handles the site's language there: the location must be one it reads and its prerequisites must hold, such as an itemPopulationContext on an item with child items. A plugin rule reports only at a site that has a reader.

**Compatibility finding**:
A finding about a form that is valid SDC but fails or misbehaves on the selected components, reported by a `smart-forms/*` rule. It states a runtime consequence the evidence shows, and is not reported where a core rule reports the same root cause.

**Flat variable context**:
How Smart Forms holds declarations: in one shared set of names, so names that SDC keeps in separate scopes can collide.

### Development

**Lint case**:
A rule test: a YAML config describing a minimal form, `test/cases/<rule>/<case>.yaml`, beside the findings the linter must report for it, `<case>.expected.yaml`. SUSHI compiles the form, so a case also exercises FSH source mapping.
_Avoid_: Fixture (a committed file used as it is)

**Corpus**:
The local, never-committed collection of real forms in `corpus/forms/`, linted to see which findings a change adds or removes against a saved snapshot.
