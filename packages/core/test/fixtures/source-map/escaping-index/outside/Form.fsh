// InstanceOf names a profile from a package, so only the SUSHI index can identify this Instance.
Instance: Form
InstanceOf: sdc-questionnaire
Usage: #example
* url = "http://example.org/Questionnaire/Form"
* status = #draft
* extension[variable].valueExpression.name = "a"
* extension[variable].valueExpression.language = #text/fhirpath
* extension[variable].valueExpression.expression = "%a.fist()"
