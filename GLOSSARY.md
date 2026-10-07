# sdc-questionnaire-lint

Static checking of the expressions inside FHIR SDC Questionnaires, for form authors, CI pipelines and AI agents.

## Language

### Expressions

**Expression site**:
One expression the linter found in a Questionnaire, with where it is, what carries it and which use cases evaluate it. Rules receive a document's expression sites as a flat list in document order.
_Avoid_: Expression location, occurrence

**Carrier**:
What holds an expression in a Questionnaire: an Expression object, a whole-string FHIRPath value, a `{{…}}` fragment embedded in an x-fhir-query, or an indirect reference to content elsewhere.

**Extension catalog**:
The linter's list of the SDC extensions that can hold an expression, with the elements each may sit on, its carrier, whether it declares and its use cases.
_Avoid_: Registry

**Catalogued location**:
A place in a Questionnaire that the extension catalog recognises, such as a variable or a calculatedExpression on an item. An expression site found anywhere else is uncatalogued, and only its syntax and function names can be checked.
_Avoid_: Registered location, known extension, supported path

**Use case**:
When an expression is evaluated: rendering (while the form is displayed and filled in), population (prefilling it from existing data) or extraction (turning answers into other resources).

**Declaration**:
An expression that introduces a name other expressions can reference as `%name`, made with a variable or itemPopulationContext extension. A name on any other expression does not declare.
_Avoid_: Variable (one kind of declaration), named expression

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
A recorded decision, with a written reason, not to report one rule's findings at one expression.
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
