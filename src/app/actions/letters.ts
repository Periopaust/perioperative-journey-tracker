"use server";

import { createClient } from "@/lib/supabase/server";
import { letterTextToDocxBuffer } from "@/lib/letter-docx";
import { revalidatePath } from "next/cache";

export async function saveLetterDraft(patientId: string, letterText: string, procedureType?: string, isPeriopLetter = false) {
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
    docx_path: docxPath,
    status: "draft",
    created_by: user.id,
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
