// Every expression here maps to its line.
Alias: $initial = http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression

// InstanceOf names a profile from a package, so only the SUSHI index identifies this Instance.
// Its id differs from its name.
Instance: HealthCheck
InstanceOf: sdc-questionnaire
Usage: #example
* id = "health-check"
* url = "http://example.org/Questionnaire/health-check"
* status = #draft
// A query and its {{…}} fragment.
* extension[sdc-questionnaire-itemPopulationContext].valueExpression
  * name = "observations"
  * language = #application/x-fhir-query
  * expression = "Observation?code=29463-7&date=ge{{(today() - 1 year}}"
// Two variables with the same text, told apart by name; flat paths.
* extension[variable][+].valueExpression.name = "first"
* extension[variable][=].valueExpression.language = #text/fhirpath
* extension[variable][=].valueExpression.expression = "%resource.item.count().fist()"
* extension[variable][+].valueExpression.name = "second"
* extension[variable][=].valueExpression.language = #text/fhirpath
* extension[variable][=].valueExpression.expression = "%resource.item.count().fist()"
* item[+]
  * linkId = "weight"
  * type = #decimal
  * text = "Weight"
  * extension[variable].valueExpression
    * name = "w"
    * language = #text/fhirpath
    * expression = "%observations.last().value.fist()"
// On _text, with escaped quotes.
* item[+]
  * linkId = "smoking"
  * type = #boolean
  * text = "Smoking"
    * extension[cqf-expression].valueExpression
      * language = #text/fhirpath
      * expression = "'Hello ' + %patient.name.given.first() + \", do you smoke?\""
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
// One item with the same text under two extensions, one named by an alias.
* item[+].linkId = "score"
* item[=].type = #decimal
* item[=].text = "Score"
* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.expression = "%score.fist()"
* item[=].extension[$initial].valueExpression.language = #text/fhirpath
* item[=].extension[$initial].valueExpression.expression = "%score.fist()"
// Uncatalogued expressions with the same text, told apart by the primitive element, and by the
// urls of the extension and sub-extension.
* item[+].linkId = "custom"
* item[=].type = #choice
* item[=].text = "Custom"
* item[=].text.extension[0].url = "http://example.org/custom"
* item[=].text.extension[0].valueExpression.language = #text/fhirpath
* item[=].text.extension[0].valueExpression.expression = "%custom.fist()"
* item[=].answerOption[0].valueString = "x"
* item[=].answerOption[0].extension[0].url = "http://example.org/custom"
* item[=].answerOption[0].extension[0].valueExpression.language = #text/fhirpath
* item[=].answerOption[0].extension[0].valueExpression.expression = "%custom.fist()"
* item[=].extension[0].url = "http://example.org/complex"
* item[=].extension[0].extension[0].url = "expr"
* item[=].extension[0].extension[0].valueExpression.language = #text/fhirpath
* item[=].extension[0].extension[0].valueExpression.expression = "%custom.fist()"

// Inline Questionnaires, which the SUSHI index never lists: one in a Bundle, one contained.
Instance: Collection
InstanceOf: Bundle
Usage: #example
* type = #collection
* entry[+].fullUrl = "http://example.org/Questionnaire/dup"
* entry[=].resource = BundledForm

Instance: BundledForm
InstanceOf: Questionnaire
Usage: #inline
* id = "dup"
* status = #draft
* extension[variable].valueExpression.name = "bundled"
* extension[variable].valueExpression.language = #text/fhirpath
* extension[variable].valueExpression.expression = "%bundled.fist()"

// The same id on another type: the search must pick the Questionnaire.
Instance: DupPatient
InstanceOf: Patient
Usage: #example
* id = "dup"
* active = true

Instance: WithContained
InstanceOf: Questionnaire
Usage: #example
* status = #draft
* contained[+] = ContainedForm

Instance: ContainedForm
InstanceOf: Questionnaire
Usage: #inline
* id = "contained-form"
* status = #draft
* item[+].linkId = "contained-item"
* item[=].type = #display
* item[=].text = "Contained item"
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.language = #text/fhirpath
* item[=].extension[sdc-questionnaire-enableWhenExpression].valueExpression.expression = "%contained.fist()"
