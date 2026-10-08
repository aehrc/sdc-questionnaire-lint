Instance: Invalid
InstanceOf: Questionnaire
Usage: #example
* status = #draft
// sdc/query-syntax: FHIRPath marked as x-fhir-query.
* extension[variable][+].valueExpression
  * name = "observations"
  * language = #application/x-fhir-query
  * expression = "%patient.id"
// sdc/fragment-parse-error: the fragment has no closing ).
* extension[variable][+].valueExpression
  * name = "recent"
  * language = #application/x-fhir-query
  * expression = "Observation?patient={{%patient.id}}&date=ge{{(today() - 1 year}}"
// sdc/unknown-function: fist() for first().
* extension[variable][+].valueExpression
  * name = "smoker"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'smoker').answer.fist().value"
* item[+]
  * linkId = "smoker"
  * type = #boolean
  * text = "Do you smoke?"
* item[+]
  * linkId = "packs"
  * type = #integer
  * text = "Packs per day"
  // sdc/parse-error: the expression ends with a dangling and.
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smoker = true and"
