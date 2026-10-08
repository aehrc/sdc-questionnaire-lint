// A file with CRLF line endings.
Instance: Crlf
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* extension[variable].valueExpression.name = "crlf"
* extension[variable].valueExpression.language = #text/fhirpath
* extension[variable].valueExpression.expression = "%crlf.fist()"
