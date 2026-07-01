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
    console.error(error);
    redirect(`/patients/new?error=${encodeURIComponent("Could not create patient. Please try again.")}`);
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

export async function updatePatient(patientId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const get = (k: string) => ((formData.get(k) as string) || "").trim() || null;

  const title = get("title");
  const first_name = get("first_name");
  const middle_name = get("middle_name");
  const last_name = get("last_name");
  const preferred_name = get("preferred_name");
  const full_name =
    [title, first_name, middle_name, last_name].filter(Boolean).join(" ") ||
    get("full_name");

  const { error } = await supabase
    .from("patients")
    .update({
      full_name,
      date_of_birth: get("date_of_birth"),
      title,
      first_name,
      middle_name,
      last_name,
      preferred_name,
      gender: get("gender"),
      sex_at_birth: get("sex_at_birth"),
      pronouns: get("pronouns"),
      sexual_orientation: get("sexual_orientation"),
      indigenous_status: get("indigenous_status"),
      mobile: get("mobile"),
      home_phone: get("home_phone"),
      work_phone: get("work_phone"),
      email: get("email"),
      fax: get("fax"),
      preferred_contact: get("preferred_contact") ?? "mobile",
      address_line1: get("address_line1"),
      address_suburb: get("address_suburb"),
      address_state: get("address_state"),
      address_postcode: get("address_postcode"),
      address_country: get("address_country") ?? "Australia",
      medicare_number: get("medicare_number"),
      medicare_irn: get("medicare_irn"),
      medicare_expiry: get("medicare_expiry"),
      dva_number: get("dva_number"),
      dva_card_colour: get("dva_card_colour"),
      health_fund: get("health_fund"),
      health_fund_number: get("health_fund_number"),
      health_fund_expiry: get("health_fund_expiry"),
      concession_type: get("concession_type"),
      concession_number: get("concession_number"),
      nok_name: get("nok_name"),
      nok_relationship: get("nok_relationship"),
      nok_phone: get("nok_phone"),
      nok_email: get("nok_email"),
      occupation: get("occupation"),
      country_of_birth: get("country_of_birth"),
      language: get("language"),
      interpreter_required: formData.get("interpreter_required") === "true",
      referring_surgeon: get("referring_surgeon"),
      planned_surgery: get("planned_surgery"),
      surgery_date: get("surgery_date"),
      hospital: get("hospital"),
    })
    .eq("id", patientId);

  if (error) throw new Error(error.message);
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
