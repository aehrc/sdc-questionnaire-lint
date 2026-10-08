// A standalone Questionnaire whose id differs from its Instance name.
Instance: HealthCheck
InstanceOf: Questionnaire
Usage: #example
Title: "Health check"
* id = "health-check"
* status = #draft
* extension[sdc-questionnaire-itemPopulationContext].valueExpression
  * name = "observations"
  * language = #application/x-fhir-query
  * expression = "Observation?code=29463-7&date=ge{{(today() - 1 year}}"
* item[+]
  * linkId = "weight"
  * type = #decimal
  * text = "Weight"
  * extension[variable].valueExpression
    * name = "w"
    * language = #text/fhirpath
    * expression = "%observations.last().value.fist()"
* item[+]
  * linkId = "smoking"
  * type = #boolean
  * text = "Smoking"
    * extension[cqf-expression].valueExpression
      * language = #text/fhirpath
      * expression = "'Hello ' + %patient.name.given.first() + \", do you smoke?\""
* item[+]
  * linkId = "bmi"
  * type = #decimal
  * text = "BMI"
  * extension[sdc-questionnaire-calculatedExpression].valueExpression
    * language = #text/fhirpath
    * expression = """
      %w / (%h * %h)).round(1
      """
