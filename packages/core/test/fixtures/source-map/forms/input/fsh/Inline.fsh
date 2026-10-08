// Inline Questionnaires, which the SUSHI index never lists: one in a Bundle, one contained.
Instance: Collection
InstanceOf: Bundle
Usage: #example
* type = #collection
* entry[+].fullUrl = "http://example.org/Questionnaire/dup"
* entry[=].resource = BundledForm

Instance: BundledForm
InstanceOf: Questionnaire
Usage: #inline
* id = "dup"
* status = #draft
* extension[variable].valueExpression.name = "bundled"
* extension[variable].valueExpression.language = #text/fhirpath
* extension[variable].valueExpression.expression = "%bundled.fist()"

// The same id on another type: the search must pick the Questionnaire.
Instance: DupPatient
InstanceOf: Patient
Usage: #example
* id = "dup"
* active = true

Instance: WithContained
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* contained[+] = ContainedForm

Instance: ContainedForm
InstanceOf: Questionnaire
Usage: #inline
* id = "contained-form"
* status = #draft
* extension[variable].valueExpression.name = "contained"
* extension[variable].valueExpression.language = #text/fhirpath
* extension[variable].valueExpression.expression = "%contained.fist()"
