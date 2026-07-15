import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Australian Medical AI Pipeline — pre-processing (spec Section 3.1).
 *
 * Loads the correction dictionary (shared dictionary_terms/term_variants tables,
 * plus this app's legacy vocabulary_corrections table) and fuzzy-matches it
 * against a raw transcript, replacing near-misses with their canonical term
 * before the transcript is ever sent to the LLM.
 */

export type DictionaryEntry = { variant: string; canonical: string };

const FUZZY_THRESHOLD = 0.8;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Loads the combined correction dictionary for this app: the shared
 * dictionary_terms + term_variants tables (spec Section 2) unioned with the
 * legacy vocabulary_corrections table the existing "Teach" UI still writes to.
 */
export async function loadDictionary(supabase: SupabaseClient): Promise<DictionaryEntry[]> {
  const [{ data: variants }, { data: legacy }] = await Promise.all([
    supabase.from("term_variants").select("variant_text, dictionary_terms(canonical_term)"),
    supabase.from("vocabulary_corrections").select("wrong_term, correct_term"),
  ]);

  const entries: DictionaryEntry[] = [];
  const seen = new Set<string>();

  type VariantRow = { variant_text: string; dictionary_terms: { canonical_term: string } | { canonical_term: string }[] | null };

  for (const v of (variants ?? []) as unknown as VariantRow[]) {
    const dt = Array.isArray(v.dictionary_terms) ? v.dictionary_terms[0] : v.dictionary_terms;
    const canonical = dt?.canonical_term;
    if (!canonical) continue;
    const variant = String(v.variant_text).toLowerCase();
    if (seen.has(variant)) continue;
    seen.add(variant);
    entries.push({ variant, canonical });
  }

  for (const l of legacy ?? []) {
    const variant = l.wrong_term.toLowerCase();
    if (seen.has(variant)) continue;
    seen.add(variant);
    entries.push({ variant, canonical: l.correct_term });
  }

  return entries;
}

/**
 * Pre-processing step (spec Section 3.1). Multi-word variants are replaced via
 * exact (case-insensitive) whole-phrase matching. Single-word variants get a
 * fuzzy pass: exact match first, then Levenshtein similarity above
 * FUZZY_THRESHOLD, so ASR near-misses that don't match anything exactly still
 * get corrected.
 */
export function preprocess(rawTranscript: string, dictionary: DictionaryEntry[]): string {
  if (!rawTranscript || dictionary.length === 0) return rawTranscript;

  let result = rawTranscript;

  const multiWord = dictionary.filter((d) => d.variant.includes(" "));
  for (const { variant, canonical } of multiWord) {
    const re = new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gi");
    result = result.replace(re, canonical);
  }

  const singleWord = dictionary.filter((d) => !d.variant.includes(" "));
  if (singleWord.length === 0) return result;

  const tokens = result.split(/(\s+)/); // keep whitespace so we can rejoin losslessly
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(token)) continue;
    const lower = token.toLowerCase();

    const exact = singleWord.find((d) => d.variant === lower);
    if (exact) {
      tokens[i] = exact.canonical;
      continue;
    }

    let best: DictionaryEntry | null = null;
    let bestScore = 0;
    for (const entry of singleWord) {
      // Cheap length-based pre-filter before running Levenshtein.
      if (Math.abs(entry.variant.length - lower.length) > 3) continue;
      const score = similarity(lower, entry.variant);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    if (best && bestScore >= FUZZY_THRESHOLD) {
      tokens[i] = best.canonical;
    }
  }

  return tokens.join("");
}
