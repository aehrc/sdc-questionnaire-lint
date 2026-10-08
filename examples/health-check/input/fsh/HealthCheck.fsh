// An adult health check with seven common authoring mistakes; see ../../README.md.
Instance: HealthCheck
InstanceOf: Questionnaire
Usage: #example
Title: "Adult health check"
* status = #draft
* title = "Adult health check"
* extension[sdc-questionnaire-itemPopulationContext].valueExpression
  * name = "observations"
  * language = #application/x-fhir-query
  * expression = "Observation?patient={{%patient.id}}&code=29463-7,8302-2"
* extension[variable].valueExpression
  * name = "age"
  * language = #text/fhirpath
  * expression = "today().toDate() - %patient.birthDate"

* item[+]
  * linkId = "body"
  * type = #group
  * text = "Body measurements"
  * item[+]
    * linkId = "weight"
    * type = #decimal
    * text = "Weight (kg)"
    * extension[sdc-questionnaire-initialExpression].valueExpression
      * language = #text/fhirpath
      * expression = "%observations.where(code.coding.code = '29463-7').value.value"
  * item[+]
    * linkId = "height"
    * type = #decimal
    * text = "Height (cm)"
    // FHIRPath marked as x-fhir-query.
    * extension[variable].valueExpression
      * name = "heights"
      * language = #application/x-fhir-query
      * expression = "%observations.where(code.coding.code = '8302-2')"
    * extension[sdc-questionnaire-initialExpression].valueExpression
      * language = #text/fhirpath
      * expression = "%heights.last().value.value"
  * item[+]
    * linkId = "bmi"
    * type = #decimal
    * text = "BMI"
    // fist() is a typo for first().
    * extension[variable].valueExpression
      * name = "h"
      * language = #text/fhirpath
      * expression = "%resource.item.where(linkId = 'body').item.where(linkId = 'height').answer.fist().value / 100"
    // .round(1 has no closing ), in an expression written over two lines.
    * extension[sdc-questionnaire-calculatedExpression].valueExpression
      * language = #text/fhirpath
      * expression = """
        (%resource.item.where(linkId = 'body').item.where(linkId = 'weight').answer.value
          / (%h * %h)).round(1
        """

* item[+]
  * linkId = "smoking"
  * type = #choice
  * text = "Do you smoke?"
    // The string uses "…"; FHIRPath strings use single quotes.
    * extension[cqf-expression].valueExpression
      * language = #text/fhirpath
      * expression = "'Hello ' + %patient.name.given.first() + \", do you smoke?\""
  // The fragment {{(today() - 1 year}} has no closing ).
  * extension[variable].valueExpression
    * name = "smokingStatus"
    * language = #application/x-fhir-query
    * expression = "Observation?patient={{%patient.id}}&code=72166-2&date=ge{{(today() - 1 year}}"
  * answerOption[+].valueString = "Yes"
  * answerOption[+].valueString = "Former smoker"
  // An extension the linter does not recognise.
  * answerOption[=].extension[0].url = "http://example.org/StructureDefinition/option-enabled"
  * answerOption[=].extension[0].valueExpression.language = #text/fhirpath
  * answerOption[=].extension[0].valueExpression.expression = "%age > 18"

* item[+]
  * linkId = "packs"
  * type = #integer
  * text = "Packs per day"
  // The expression ends with a dangling and.
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%resource.item.where(linkId = 'smoking').answer.value = 'Yes' and"
