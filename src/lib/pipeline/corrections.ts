import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME } from "./prompt";

/**
 * Shared Australian Medical AI Pipeline — correction logging (spec Section 3.4)
 * and the promotion job (spec Section 3.5).
 */

export async function logCorrection(
  supabase: SupabaseClient,
  params: { originalText: string; correctedText: string; contextSnippet?: string | null; userId?: string | null },
) {
  const original = params.originalText?.trim() ?? "";
  const corrected = params.correctedText?.trim() ?? "";
  if (!original || !corrected || original === corrected) return;

  await supabase.from("corrections").insert({
    app_name: APP_NAME,
    original_text: original,
    corrected_text: corrected,
    context_snippet: params.contextSnippet?.slice(0, 500) ?? null,
    user_id: params.userId ?? null,
  });
}

type Span = { before: string; after: string; context: string };

// Guard against pathological O(n*m) blowups on very long documents — above
// this word-count product we fall back to logging the whole-document diff as
// a single row rather than computing a word-level alignment.
const MAX_DIFF_CELLS = 250000;

function diffWords(a: string[], b: string[]): Span[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const spans: Span[] = [];
  let i = 0;
  let j = 0;
  let changedA: string[] = [];
  let changedB: string[] = [];

  const flush = (contextWords: string[]) => {
    if (changedA.length || changedB.length) {
      spans.push({
        before: changedA.join(" "),
        after: changedB.join(" "),
        context: contextWords.slice(-8).join(" "),
      });
      changedA = [];
      changedB = [];
    }
  };

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush(b.slice(Math.max(0, j - 8), j));
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      changedA.push(a[i]);
      i++;
    } else {
      changedB.push(b[j]);
      j++;
    }
  }
  while (i < n) {
    changedA.push(a[i]);
    i++;
  }
  while (j < m) {
    changedB.push(b[j]);
    j++;
  }
  flush(b.slice(Math.max(0, m - 8)));

  return spans.filter((s) => s.before || s.after);
}

/**
 * Word-level diff between an AI draft and what the clinician actually saved.
 * Logs each contiguous changed span as its own correction row so the
 * promotion job can group by (original_text, corrected_text) and find fixes
 * that recur across notes/users, instead of logging whole-document diffs that
 * never repeat verbatim.
 */
export async function diffAndLogCorrections(
  supabase: SupabaseClient,
  params: { originalText: string; correctedText: string; userId?: string | null },
) {
  const originalText = params.originalText?.trim() ?? "";
  const correctedText = params.correctedText?.trim() ?? "";
  if (!originalText || !correctedText || originalText === correctedText) return;

  const a = originalText.split(/\s+/);
  const b = correctedText.split(/\s+/);

  if (a.length * b.length > MAX_DIFF_CELLS) {
    await logCorrection(supabase, {
      originalText: originalText.slice(0, 500),
      correctedText: correctedText.slice(0, 500),
      contextSnippet: "whole-document diff (too large to align word-by-word)",
      userId: params.userId,
    });
    return;
  }

  const spans = diffWords(a, b);
  for (const span of spans) {
    await logCorrection(supabase, {
      originalText: span.before,
      correctedText: span.after,
      contextSnippet: span.context,
      userId: params.userId,
    });
  }
}

/**
 * Promotion job (spec Section 3.5). Groups unpromoted corrections for this app
 * by (original_text, corrected_text); once a fix recurs across enough distinct
 * occurrences/users it gets folded into dictionary_terms/term_variants so
 * preprocess() applies it automatically going forward.
 *
 * Meant to be triggered manually from the admin panel (see admin.ts /
 * CorrectionsPanel) — can be moved to a schedule once correction volume
 * justifies it, per the spec's suggested build order.
 */
export async function promoteCorrections(
  supabase: SupabaseClient,
  opts: { minOccurrences?: number; minUsers?: number } = {},
) {
  const minOccurrences = opts.minOccurrences ?? 5;
  const minUsers = opts.minUsers ?? 3;

  const { data: rows, error } = await supabase
    .from("corrections")
    .select("id, original_text, corrected_text, user_id")
    .eq("app_name", APP_NAME)
    .eq("promoted", false);

  if (error) throw error;
  if (!rows || rows.length === 0) return { promoted: 0, groups: 0 };

  type Group = { original: string; corrected: string; ids: string[]; users: Set<string> };
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const key = `${row.original_text.toLowerCase()} ${row.corrected_text.toLowerCase()}`;
    const g: Group = groups.get(key) ?? {
      original: row.original_text,
      corrected: row.corrected_text,
      ids: [],
      users: new Set<string>(),
    };
    g.ids.push(row.id);
    if (row.user_id) g.users.add(row.user_id);
    groups.set(key, g);
  }

  let promoted = 0;
  let promotedGroups = 0;

  for (const g of groups.values()) {
    if (g.ids.length < minOccurrences || g.users.size < minUsers) continue;

    const { data: term, error: upsertErr } = await supabase
      .from("dictionary_terms")
      .upsert(
        { canonical_term: g.corrected, term_type: "jargon", source: "learned" },
        { onConflict: "canonical_term,term_type" },
      )
      .select("id")
      .single();

    if (upsertErr || !term) continue;

    await supabase
      .from("term_variants")
      .upsert(
        { variant_text: g.original.toLowerCase(), canonical_term_id: term.id, times_seen: g.ids.length },
        { onConflict: "variant_text" },
      );

    await supabase.from("corrections").update({ promoted: true }).in("id", g.ids);
    promoted += g.ids.length;
    promotedGroups += 1;
  }

  return { promoted, groups: promotedGroups };
}
