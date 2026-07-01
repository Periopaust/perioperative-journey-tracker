"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ShareRecord = {
  id: string;
  shared_with_id: string;
  permission: string;
  created_at: string;
  profile: { full_name: string; email: string | null } | null;
};

export async function getPatientShares(patientId: string): Promise<ShareRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_shares")
    .select("id, shared_with_id, permission, created_at, profile:profiles!shared_with_id(full_name, email)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as ShareRecord[];
}

export async function sharePatient(patientId: string, email: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const emailLower = email.trim().toLowerCase();
  if (emailLower === user.email?.toLowerCase()) return { error: "You cannot share a patient with yourself" };

  // Look up the target clinician's profile by email
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .ilike("email", emailLower)
    .maybeSingle();

  if (!targetProfile) {
    return { error: `No clinician found with email ${email}. They must have logged in at least once.` };
  }

  // Confirm current user owns this patient
  const { data: patient } = await supabase
    .from("patients")
    .select("id, created_by")
    .eq("id", patientId)
    .single();

  if (!patient) return { error: "Patient not found" };
  if (patient.created_by !== user.id) return { error: "Only the patient owner can share access" };

  const { error } = await supabase.from("patient_shares").insert({
    patient_id: patientId,
    owner_id: user.id,
    shared_with_id: targetProfile.id,
    permission: "clinical",
  });

  if (error) {
    if (error.code === "23505") return { error: "This clinician already has access" };
    return { error: error.message };
  }

  revalidatePath(`/patients/${patientId}`);
  return {};
}

export async function removeShare(shareId: string, patientId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("patient_shares")
    .delete()
    .eq("id", shareId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/patients/${patientId}`);
  return {};
}

/** Returns share info for a list of patient ids — used in the patients list to show "Shared by X" */
export async function getSharesForCurrentUser(): Promise<{
  ownedShares: { patient_id: string; shared_with: { full_name: string }[] }[];
  sharedWithMe: { patient_id: string; owner: { full_name: string } | null }[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ownedShares: [], sharedWithMe: [] };

  const [{ data: owned }, { data: shared }] = await Promise.all([
    supabase
      .from("patient_shares")
      .select("patient_id, shared_with:profiles!shared_with_id(full_name)")
      .eq("owner_id", user.id),
    supabase
      .from("patient_shares")
      .select("patient_id, owner:profiles!owner_id(full_name)")
      .eq("shared_with_id", user.id),
  ]);

  return {
    ownedShares: (owned ?? []) as any,
    sharedWithMe: (shared ?? []) as any,
  };
}
