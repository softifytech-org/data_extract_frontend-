// Mirrors the backend's closed vocabularies (app/services/extraction/patterns.py).
// A field renders as a dropdown only when its extracted value exactly matches
// one of these options - otherwise it falls back to a text input flagged for
// review, rather than silently forcing an arbitrary selection (spec: never
// auto-select an option the OCR value doesn't actually match).

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

export const COUNTRIES = ["US", "USA"];

export const GENDERS = ["MALE", "FEMALE"];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const YES_NO_NA = ["YES", "NO", "N.A"];

export const CARD_NAMES = [
  "AMERICAN EXPRESS",
  "AMERICAN EXPRESS GREEN CARD",
  "AMERICAN EXPRESS PLATINUM CARD",
  "MASTER CARD",
  "MASTERCARD",
  "VISA",
  "DISCOVER",
  "BANK",
  "RETAIL",
];

export const MEDICINES = ["XANAX", "VALIUM", "ZOLOFT", "PHENTERMINE", "AMBIEN", "DIAZEPAM", "ADIPEX"];

// field_name -> option list, for fields the legacy form renders as dropdowns.
export const FIELD_OPTIONS: Record<string, string[]> = {
  sex_1: GENDERS,
  sex_2: GENDERS,
  state_1: US_STATES,
  state_2: US_STATES,
  country_1: COUNTRIES,
  country_2: COUNTRIES,
  blood_group: BLOOD_GROUPS,
  alcoholic: YES_NO_NA,
  smoker: YES_NO_NA,
  past_surg: YES_NO_NA,
  diabetic: YES_NO_NA,
  card_name: CARD_NAMES,
  medicine: MEDICINES,
};
