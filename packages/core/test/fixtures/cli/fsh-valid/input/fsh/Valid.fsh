Instance: Valid
InstanceOf: Questionnaire
Usage: #example
* status = #draft
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
    * expression = "%resource.item.where(linkId = 'smoker').answer.first().value"
