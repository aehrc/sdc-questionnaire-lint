import {
  type CataloguedLocation,
  definedLanguages,
  type ExpressionSite,
  languagesAllowedAt,
} from 'sdc-questionnaire-lint';
import { CQF_EXPRESSION } from '../urls.js';

// What the two language rules share.

// A site at a catalogued location.
export type LocatedSite = ExpressionSite & { location: CataloguedLocation };

export function isLocatedSite(site: ExpressionSite): site is LocatedSite {
  return site.location !== undefined;
}

// A site the language rules check: an Expression at a catalogued location, with a language and
// expression text. A reference-only Expression is sdc/external-expression's.
export type LanguageSite = LocatedSite & {
  language: string;
  text: string;
};

export function isLanguageSite(site: ExpressionSite): site is LanguageSite {
  return (
    site.carrier === 'expression' &&
    site.location !== undefined &&
    site.language !== undefined &&
    site.text !== undefined &&
    site.text !== ''
  );
}

// Whether core reports the language at the site, so the plugin stays silent (S9): a code outside
// the six FHIR defines (sdc/language-not-in-value-set), or one SDC does not allow there
// (sdc/language-not-allowed, or the Validator's sdc-inv1). Checked here, never by whether those
// rules ran.
export function coreReportsLanguage({ language, location }: LanguageSite): boolean {
  const allowed = languagesAllowedAt(location);
  return (
    !definedLanguages.includes(language) || (allowed !== undefined && !allowed.includes(language))
  );
}

// The extension's name in a message: the last segment of its URL without the SDC prefix, such as
// calculatedExpression; for cqf-expression, also the element, such as cqf-expression on text.
export function extensionName(site: LocatedSite): string {
  const name = site.location.url.slice(site.location.url.lastIndexOf('/') + 1);
  const short = name.replace(/^sdc-questionnaire-/, '');
  return site.location.url === CQF_EXPRESSION && site.element !== undefined
    ? `${short} on ${site.element}`
    : short;
}
