Instance: Invalid
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* extension[sdc-questionnaire-launchContext][+]
  * extension[name].valueCoding = http://hl7.org/fhir/uv/sdc/CodeSystem/launchContext#patient
  * extension[type].valueCode = #Patient
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
* item[+]
  * linkId = "smoking-records"
  * type = #integer
  * text = "Smoking status records"
  * readOnly = true
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%observati12312313.total"
* item[+]
  * linkId = "recent-records"
  * type = #integer
  * text = "Observations in the last year"
  * readOnly = true
  // sdc/undefined-variable: %recnet for %recent.
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%recnet.total"
