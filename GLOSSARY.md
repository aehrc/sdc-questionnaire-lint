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
_Avoid_: Visibility, context (FHIRPath's `%context` is something else); scope, except for the public `Scope`/`scopeAt` plugin stub, which stays until a plugin needs available variables

**Host variable**:
A name an expression can reference that the form does not declare and that FHIRPath, FHIR and SDC do not define, but that the application running the form supplies at runtime by its own convention, such as an entry in Smart Forms' additionalContext or `%PrePopQuery` for a sourceQueries Bundle. Listed by exact name in the config's `hostVariables`, and available at every site.
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

### Smart Forms compatibility

**Smart Forms**:
AEHRC's open-source SDC form stack, the runtime whose behaviour the Smart Forms plugin checks forms against.

**Component**:
One independently versioned part of Smart Forms: renderer, populate or template-extract. A construct can work in one component and fail in another.

**Compatibility target**:
The component versions a config checks against. The default, `"smart-forms": "latest"`, means the newest versions the installed plugin knows.

**Compatibility finding**:
A finding about a form that is valid SDC but fails or misbehaves on the selected components, reported by a `smart-forms/*` rule.

**Flat variable context**:
How Smart Forms holds declarations: in one shared set of names, so names that SDC keeps in separate scopes can collide.
