// A parameterised RuleSet writes one expression; another is repeated in a definition with an insert.
RuleSet: EnableWhen(expression)
* extension[sdc-questionnaire-enableWhenExpression].valueExpression.language = #text/fhirpath
* extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "{expression}"

Instance: WithInsert
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* item[+].linkId = "inserted"
* item[=].type = #display
* item[=].text = "Inserted"
* item[=] insert EnableWhen([[%inserted.fist()]])
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
