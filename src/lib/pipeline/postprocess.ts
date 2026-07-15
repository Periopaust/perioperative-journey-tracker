import { preprocess, type DictionaryEntry } from "./dictionary";

/**
 * Shared Australian Medical AI Pipeline — post-processing (spec Section 3.3).
 *
 * validate_medications(): re-runs the same fuzzy dictionary match used for
 * pre-processing against the LLM's own output, catching any residual
 * ASR-style misspelling the model introduced or failed to fix.
 *
 * check_spelling_au(): rewrites common US spellings to Australian spelling.
 *
 * enforce_format(): light structural guard — per-document-type formatting is
 * already enforced by the prompts themselves (see the FORMAT INSTRUCTIONS
 * blocks in each route), so this just trims stray whitespace.
 */

const AU_SPELLING: Record<string, string> = {
  hyponatremia: "hyponatraemia",
  hypernatremia: "hypernatraemia",
  edema: "oedema",
  edematous: "oedematous",
  hemoglobin: "haemoglobin",
  hematology: "haematology",
  hematoma: "haematoma",
  anesthetic: "anaesthetic",
  anesthesia: "anaesthesia",
  anesthetist: "anaesthetist",
  paresthesia: "paraesthesia",
  paresthesiae: "paraesthesiae",
  esophagus: "oesophagus",
  esophageal: "oesophageal",
  diarrhea: "diarrhoea",
  fetus: "foetus",
  fetal: "foetal",
  leukemia: "leukaemia",
  leukocyte: "leucocyte",
  pediatric: "paediatric",
  gynecology: "gynaecology",
  gynecological: "gynaecological",
  orthopedic: "orthopaedic",
  hemorrhage: "haemorrhage",
  hemodynamic: "haemodynamic",
  color: "colour",
  center: "centre",
  fiber: "fibre",
  labor: "labour",
  tumor: "tumour",
  behavior: "behaviour",
};

function matchCase(source: string, target: string): string {
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return target[0].toUpperCase() + target.slice(1);
  return target;
}

export function checkSpellingAU(text: string): string {
  let result = text;
  for (const [us, au] of Object.entries(AU_SPELLING)) {
    const re = new RegExp(`\\b${us}\\b`, "gi");
    result = result.replace(re, (match) => matchCase(match, au));
  }
  return result;
}

export function validateMedications(text: string, dictionary: DictionaryEntry[]): string {
  return preprocess(text, dictionary);
}

export function enforceFormat(text: string): string {
  return text.trim();
}

/**
 * postprocess() (spec Section 3.3): runs the three checks above in sequence.
 */
export function postprocess(llmOutput: string, dictionary: DictionaryEntry[]): string {
  let result = llmOutput;
  result = validateMedications(result, dictionary);
  result = checkSpellingAU(result);
  result = enforceFormat(result);
  return result;
}
