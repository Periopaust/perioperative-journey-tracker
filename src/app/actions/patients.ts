"use server";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/checklist";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createPatient(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const patient = {
    full_name: String(formData.get("full_name") ?? ""),
    date_of_birth: String(formData.get("date_of_birth") ?? ""),
    ur_number: String(formData.get("ur_number") ?? ""),
    referring_surgeon: String(formData.get("referring_surgeon") ?? ""),
    planned_surgery: String(formData.get("planned_surgery") ?? ""),
    surgery_date: String(formData.get("surgery_date") ?? "") || null,
    hospital: String(formData.get("hospital") ?? ""),
    created_by: user!.id,
  };

  const { data: created, error } = await supabase
    .from("patients")
    .insert(patient)
    .select("id")
    .single();

  if (error) {
    redirect(`/patients/new?error=${encodeURIComponent(error.message)}`);
  }

  const items = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
    patient_id: created!.id,
    ...item,
  }));
  await supabase.from("checklist_items").insert(items);

  redirect(`/patients/${created!.id}`);
}

export async function updatePatientBloodsStatus(patientId: string, status: string) {
  const supabase = await createClient();
  await supabase.from("patients").update({ bloods_status: status }).eq("id", patientId);
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/dashboard");
}

export async function toggleChecklistItem(itemId: string, patientId: string, completed: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase
    .from("checklist_items")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? user?.id : null,
    })
    .eq("id", itemId);

  revalidatePath(`/patients/${patientId}`);
}

export async function addClinicalNote(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  await supabase.from("clinical_notes").insert({
    patient_id: patientId,
    author_id: user!.id,
    note,
  });

  revalidatePath(`/patients/${patientId}`);
}
