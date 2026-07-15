"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { diffAndLogCorrections, promoteCorrections } from "@/lib/pipeline/corrections";

/**
 * Generic correction-logging entry point for AI-generated documents that
 * aren't persisted through a dedicated save action (e.g. the "Generate from
 * ward notes" outputs in WardPanel, which are only copied, not saved to a
 * table). Spec Section 3.4.
 */
export async function logDocumentCorrection(originalText: string, correctedText: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await diffAndLogCorrections(supabase, {
    originalText,
    correctedText,
    userId: user.id,
  }).catch(() => {});
}

export type PromotionResult = { promoted: number; groups: number };

/**
 * Manual trigger for the promotion job (spec Section 3.5). Admin-only: the
 * spec's recommended rollout is "review corrections weekly yourself before
 * promoting", and only admins can mark corrections.promoted per RLS anyway.
 */
export async function runPromotionJob(): Promise<PromotionResult> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated");
  if (profile.role !== "admin") throw new Error("Admin only");

  const supabase = await createClient();
  return promoteCorrections(supabase);
}

export async function getUnpromotedCorrections() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("corrections")
    .select("id, original_text, corrected_text, context_snippet, created_at, promoted")
    .eq("app_name", "periop_journey_tracker")
    .eq("promoted", false)
    .order("created_at", { ascending: false })
    .limit(100);

  return data ?? [];
}
