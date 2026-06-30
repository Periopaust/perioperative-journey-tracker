"use server";

import { createClient } from "@/lib/supabase/server";

export type VocabularyCorrection = {
  id: string;
  wrong_term: string;
  correct_term: string;
  category: string;
};

export async function getVocabularyCorrections(): Promise<VocabularyCorrection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vocabulary_corrections")
    .select("id, wrong_term, correct_term, category")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function saveVocabularyCorrection(wrongTerm: string, correctTerm: string, category: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("vocabulary_corrections")
    .upsert(
      { wrong_term: wrongTerm.toLowerCase().trim(), correct_term: correctTerm.trim(), category, created_by: user.id },
      { onConflict: "wrong_term" }
    );

  if (error) throw error;
}

export async function deleteVocabularyCorrection(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vocabulary_corrections").delete().eq("id", id);
  if (error) throw error;
}

