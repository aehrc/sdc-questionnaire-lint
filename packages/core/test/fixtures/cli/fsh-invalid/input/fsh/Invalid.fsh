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
// sdc/unresolved-linkid: 'pack' for 'packs'.
* extension[variable][+].valueExpression
  * name = "packs"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'pack').answer.value"
* extension[variable][+].valueExpression
  * name = "yearsSmoked"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'years').answer.value"
// sdc/dependency-cycle: packYears and smokingYears reference each other.
* extension[variable][+].valueExpression
  * name = "packYears"
  * language = #text/fhirpath
  * expression = "%packs * %smokingYears"
* extension[variable][+].valueExpression
  * name = "smokingYears"
  * language = #text/fhirpath
  * expression = "%packYears / %packs"
// sdc/duplicate-declaration: a second yearsSmoked on the root.
* extension[variable][+].valueExpression
  * name = "yearsSmoked"
  * language = #text/fhirpath
  * expression = "%resource.item.where(linkId = 'years').answer.value.first()"
// sdc/reserved-name: context is defined by FHIRPath.
* extension[variable][+].valueExpression
  * name = "context"
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
  // sdc/parse-error: the expression ends with a dangling and.
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smoker = true and"
* item[+]
  * linkId = "years"
  * type = #integer
  * text = "Years smoked"
  // sdc/language-not-allowed: an enableWhenExpression written as a query.
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/x-fhir-query
    * expression = "Observation?patient={{%patient.id}}&code=72166-2"
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
    * expression = "%context.exists()"
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
  // sdc/undefined-variable: %recnet for %recent.
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%recnet.total"
* item[+]
  * linkId = "cessation"
  * type = #date
  * text = "Date you stopped smoking"
  // sdc/unused-declaration: quitDate is never referenced.
  * extension[variable][+].valueExpression
    * name = "quitDate"
    * language = #text/fhirpath
    * expression = "%resource.item.where(linkId = 'cessation').answer.value"
  // sdc/shadowed-declaration: the root already declares smoker.
  * extension[variable][+].valueExpression
    * name = "smoker"
    * language = #text/fhirpath
    * expression = "%resource.item.where(linkId = 'smoker').answer.value.first()"
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%smoker = false"
* item[+]
  * linkId = "advice"
  * type = #string
  * text = "Cessation advice"
  * readOnly = true
  // sdc/external-expression: the content is only in a Library.
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/cql
    * reference = "http://example.org/Library/cessation-advice"
* item[+]
  * linkId = "notes"
  * type = #string
  * text = "Notes"
  // sdc/language-not-in-value-set: text/fhir-path for text/fhirpath.
  * extension[sdc-questionnaire-initialExpression].valueExpression
    * language = #text/fhir-path
    * expression = "'No notes'"
* item[+]
  * linkId = "summary"
  * type = #string
  * text = "Summary"
  * readOnly = true
  // sdc/uncatalogued-expression: calculatedExpresion is a misspelt extension URL.
  * extension[+].url = "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpresion"
  * extension[=].valueExpression
    * language = #text/fhirpath
    * expression = "iif(%smoker, 'Smoker', 'Non-smoker')"
