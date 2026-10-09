Instance: Valid
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* extension[sdc-questionnaire-launchContext][+]
  * extension[name].valueCoding = http://hl7.org/fhir/uv/sdc/CodeSystem/launchContext#patient
  * extension[type].valueCode = #Patient
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
* extension[variable][+].valueExpression
  * name = "packs"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'packs').answer.value"
* extension[variable][+].valueExpression
  * name = "yearsSmoked"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'years').answer.value"
* extension[variable][+].valueExpression
  * name = "packYears"
  * language = #text/fhirpath
  * expression = "%packs * %smokingYears"
* extension[variable][+].valueExpression
  * name = "smokingYears"
  * language = #text/fhirpath
  * expression = "%yearsSmoked"
* extension[variable][+].valueExpression
  * name = "smokerItem"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'smoker')"
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
* item[+]
  * linkId = "years"
  * type = #integer
  * text = "Years smoked"
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smoker = true"
* item[+]
  * linkId = "pack-years"
  * type = #decimal
  * text = "Pack-years"
  * readOnly = true
  * extension[sdc-questionnaire-calculatedExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%packYears"
* item[+]
  * linkId = "context-check"
  * type = #boolean
  * text = "Context check"
  * readOnly = true
  * extension[sdc-questionnaire-calculatedExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smokerItem.exists()"
* item[+]
  * linkId = "smoking-records"
  * type = #integer
  * text = "Smoking status records"
  * readOnly = true
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%observations.total"
* item[+]
  * linkId = "recent-records"
  * type = #integer
  * text = "Observations in the last year"
  * readOnly = true
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%recent.total"
* item[+]
  * linkId = "cessation"
  * type = #date
  * text = "Date you stopped smoking"
  * extension[variable][+].valueExpression
    * name = "smokerAnswer"
    * language = #text/fhirpath
    * expression = "%resource.item.where(linkId = 'smoker').answer.value.first()"
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smokerAnswer = false"
* item[+]
  * linkId = "advice"
  * type = #string
  * text = "Cessation advice"
  * readOnly = true
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "'Talk to your GP about quitting.'"
* item[+]
  * linkId = "notes"
  * type = #string
  * text = "Notes"
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "'No notes'"
* item[+]
  * linkId = "summary"
  * type = #string
  * text = "Summary"
  * readOnly = true
  * extension[sdc-questionnaire-calculatedExpression].valueExpression
    * language = #text/fhirpath
    * expression = "iif(%smoker, 'Smoker', 'Non-smoker')"
