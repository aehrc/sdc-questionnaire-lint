// Repeated expressions, and what tells them apart.
Instance: Anchors
InstanceOf: Questionnaire
Usage: #example
* status = #draft
// Two variables on the root with the same text, told apart by name; flat paths.
* extension[variable][+].valueExpression.name = "first"
* extension[variable][=].valueExpression.language = #text/fhirpath
* extension[variable][=].valueExpression.expression = "%resource.item.count().fist()"
* extension[variable][+].valueExpression.name = "second"
* extension[variable][=].valueExpression.language = #text/fhirpath
* extension[variable][=].valueExpression.expression = "%resource.item.count().fist()"
// Sibling items with the same text, told apart by linkId; indented, linkId after the expression.
* item[+]
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%age.fist() > 12"
  * linkId = "older"
  * type = #display
  * text = "Older"
* item[+]
  * extension[sdc-questionnaire-enableWhenExpression].valueExpression
    * language = #text/fhirpath
    * expression = "%age.fist() > 12"
  * linkId = "also-older"
  * type = #display
  * text = "Also older"
// One item with the same text under two extensions; flat paths.
* item[+].linkId = "score"
* item[=].type = #decimal
* item[=].text = "Score"
* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.expression = "%score.fist()"
* item[=].extension[sdc-questionnaire-initialExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-initialExpression].valueExpression.expression = "%score.fist()"
// Two unnamed expressions under one extension in one item: nothing tells them apart.
* item[+].linkId = "twins"
* item[=].type = #string
* item[=].text = "Twins"
* item[=].extension[sdc-questionnaire-candidateExpression][+].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-candidateExpression][=].valueExpression.expression = "%twin.fist()"
* item[=].extension[sdc-questionnaire-candidateExpression][+].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-candidateExpression][=].valueExpression.expression = "%twin.fist()"
