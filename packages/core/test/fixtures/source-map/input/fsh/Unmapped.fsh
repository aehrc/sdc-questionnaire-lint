// No expression here maps; the fixture test gives each one's reason.
RuleSet: EnableWhen(expression)
* extension[sdc-questionnaire-enableWhenExpression].valueExpression.language = #text/fhirpath
* extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "{expression}"

RuleSet: LateLinkId
* linkId = "late"

Instance: Twins
InstanceOf: Questionnaire
Usage: #example
* status = #draft
// Two unnamed expressions under one extension in one item: nothing tells them apart.
* item[+].linkId = "twins"
* item[=].type = #string
* item[=].text = "Twins"
* item[=].extension[sdc-questionnaire-candidateExpression][+].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-candidateExpression][=].valueExpression.expression = "%twin.fist()"
* item[=].extension[sdc-questionnaire-candidateExpression][+].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-candidateExpression][=].valueExpression.expression = "%twin.fist()"
// A """ literal.
* item[+]
  * linkId = "bmi"
  * type = #decimal
  * text = "BMI"
  * extension[sdc-questionnaire-calculatedExpression].valueExpression
    * language = #text/fhirpath
    * expression = """
      %w / (%h * %h)).round(1
      """

Instance: WithInsert
InstanceOf: Questionnaire
Usage: #example
* status = #draft
// Written by a parameterised RuleSet.
* item[+].linkId = "inserted"
* item[=].type = #display
* item[=].text = "Inserted"
* item[=] insert EnableWhen([[%inserted.fist()]])
// Repeated text in a definition with an insert.
* item[+].linkId = "first-twin"
* item[=].type = #display
* item[=].text = "First twin"
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%twin.fist()"
* item[+].linkId = "second-twin"
* item[=].type = #display
* item[=].text = "Second twin"
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%twin.fist()"
// A """ literal on an item whose linkId a RuleSet assigns.
* item[+] insert LateLinkId
* item[=].type = #display
* item[=].text = "Late"
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = """
    %late.fist()
    """
