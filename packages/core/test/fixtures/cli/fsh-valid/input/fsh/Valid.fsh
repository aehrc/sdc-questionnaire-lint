Instance: Valid
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* extension[variable][+].valueExpression
  * name = "observations"
  * language = #application/x-fhir-query
  * expression = "Observation?patient={{%patient.id}}&code=72166-2"
* extension[variable][+].valueExpression
  * name = "recent"
  * language = #application/x-fhir-query
  * expression = "Observation?patient={{%patient.id}}&date=ge{{today() - 1 year}}"
* extension[variable][+].valueExpression
  * name = "smoker"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'smoker').answer.first().value"
* item[+]
  * linkId = "smoker"
  * type = #boolean
  * text = "Do you smoke?"
* item[+]
  * linkId = "packs"
  * type = #integer
  * text = "Packs per day"
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smoker = true"
