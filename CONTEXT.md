# sdc-questionnaire-lint

Static checking of the expressions inside FHIR SDC Questionnaires, for form authors, CI pipelines and AI agents.

## Language

**Finding**:
One reported problem at one place in a Questionnaire or the linter's configuration, identified by a rule.
_Avoid_: Diagnostic, issue, violation, error (an error is a severity of a finding)

**Suppression**:
A recorded decision, with a written reason, not to report one rule's findings at one expression.
_Avoid_: Exception, ignore, disable

**Stale suppression**:
A suppression established to be unnecessary after its target has been checked or confirmed to no longer exist. It is itself reported as a finding; a suppression whose target was not assessed is not stale.
_Avoid_: Unused suppression, dead suppression

**Rule off**:
A configuration choice that stops a rule from running anywhere. It is not a suppression.

**Expression site**:
One expression the linter found in a Questionnaire, with where it is, what carries it and which use cases evaluate it. Rules receive a document's expression sites as a flat list in document order.
_Avoid_: Expression location, occurrence

**Registered location**:
A place in a Questionnaire that the linter's registry recognises, such as a variable or a calculatedExpression on an item. An expression site found anywhere else is unregistered, and only its syntax and function names can be checked.
_Avoid_: Known extension, supported path
