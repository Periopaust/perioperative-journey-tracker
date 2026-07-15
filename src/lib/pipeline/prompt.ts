import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Australian Medical AI Pipeline — context assembly (spec Section 3.2).
 *
 * app_configs holds the per-app system prompt (Section 4 template, filled in
 * for this app) so it can be tuned from the database without a redeploy, and
 * so the same row shape works for the other five apps sharing this pipeline.
 */

export const APP_NAME = "periop_journey_tracker" as const;

export const FALLBACK_SYSTEM_PROMPT = `You are an AI assistant supporting Australian clinicians with perioperative patient journey summaries, ward documentation, and handover.
Rules:
- Use Australian English spelling throughout.
- Never invent or guess medication names — if a drug name is unclear or not in the provided dictionary, flag it as [UNCLEAR: original text] rather than substituting a guess.
- Prefer concise, clinical language consistent with Australian hospital documentation norms.
- If information is missing or uncertain, state that explicitly rather than fabricating it.
- Expand only abbreviations not already resolved in the input; do not over-expand accepted clinical shorthand (e.g. leave "BD", "PRN", "STAT" as-is).`;

export type AppConfig = { systemPrompt: string; outputStructure: string };

export async function getAppConfig(supabase: SupabaseClient): Promise<AppConfig> {
  const { data } = await supabase
    .from("app_configs")
    .select("system_prompt, output_structure")
    .eq("app_name", APP_NAME)
    .single();

  return {
    systemPrompt: data?.system_prompt || FALLBACK_SYSTEM_PROMPT,
    outputStructure: data?.output_structure || "perioperative_handover",
  };
}

export type PatientContext = Record<string, string | null | undefined>;

/**
 * build_prompt() (spec Section 3.2): system prompt + patient context +
 * pre-processed transcript. Returns separate system/user strings so callers
 * can pass them straight into a chat completion.
 */
export function buildPrompt(params: {
  systemPrompt: string;
  patientContext: PatientContext;
  transcript: string;
  formatInstructions?: string;
}): { system: string; user: string } {
  const contextLines = Object.entries(params.patientContext)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `${labelize(k)}: ${v}`)
    .join("\n");

  const user = [
    contextLines ? `PATIENT CONTEXT\n${contextLines}` : "",
    params.formatInstructions ? `FORMAT INSTRUCTIONS\n${params.formatInstructions}` : "",
    `TRANSCRIPT\n${params.transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: params.systemPrompt, user };
}

function labelize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
