"use server";

import { createClient } from "@/lib/supabase/server";
import { letterTextToDocxBuffer } from "@/lib/letter-docx";
import { revalidatePath } from "next/cache";

export async function saveLetterDraft(
  patientId: string,
  letterText: string,
  procedureType?: string,
  isPeriopLetter = false,
  meta?: {
    priority?: "routine" | "urgent";
    letter_to?: "doctor" | "patient";
    recipient_name?: string;
    recipient_address?: string;
    cc?: string;
    template?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: patient } = await supabase
    .from("patients")
    .select("ur_number")
    .eq("id", patientId)
    .single();

  if (!patient) throw new Error("Patient not found");

  const { data: existingLetters } = await supabase
    .from("letters")
    .select("letter_code")
    .eq("patient_id", patientId)
    .like("letter_code", `${patient.ur_number}-L%`);

  const prefix = `${patient.ur_number}-L`;
  const maxSeq = (existingLetters || []).reduce((max, row) => {
    const seq = parseInt(row.letter_code.slice(prefix.length), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  const letterCode = `${prefix}${maxSeq + 1}`;
  const docxPath = `${patient.ur_number}/${letterCode}.docx`;

  const docxBuffer = await letterTextToDocxBuffer(letterText, isPeriopLetter);

  const { error: uploadError } = await supabase.storage
    .from("patient-letters")
    .upload(docxPath, docxBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("letters").insert({
    patient_id: patientId,
    letter_code: letterCode,
    procedure_type: procedureType || null,
    content: letterText,
    docx_path: docxPath,
    status: "draft",
    created_by: user.id,
    priority: meta?.priority || "routine",
    letter_to: meta?.letter_to || "doctor",
    recipient_name: meta?.recipient_name || null,
    recipient_address: meta?.recipient_address || null,
    cc: meta?.cc || null,
    template: meta?.template || null,
  });

  if (insertError) throw insertError;

  revalidatePath(`/patients/${patientId}`);

  return { letterCode };
}

export async function updateLetterStatus(letterId: string, patientId: string, status: "draft" | "reviewed" | "sent") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("letters").update({ status }).eq("id", letterId);
  if (error) throw error;

  revalidatePath(`/patients/${patientId}`);
}

export async function addLetterNote(letterId: string, patientId: string, notes: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("letters").update({ notes }).eq("id", letterId);
  if (error) throw error;

  revalidatePath(`/patients/${patientId}`);
}

export async function getLetterSignedUrl(docxPath: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.storage
    .from("patient-letters")
    .createSignedUrl(docxPath, 60 * 5);

  if (error) throw error;
  return data.signedUrl;
}
