"use server";

import { createClient } from "@/lib/supabase/server";
import { letterTextToDocxBuffer } from "@/lib/letter-docx";
import { revalidatePath } from "next/cache";
import { extractAndUpdateBloods } from "./patients";

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

  // Silently scan letter for blood test mentions and auto-update patient status
  extractAndUpdateBloods(patientId, letterText).catch(() => {});

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

export async function deleteLetter(letterId: string, patientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get docx path so we can delete from storage too
  const { data: letter } = await supabase.from("letters").select("docx_path").eq("id", letterId).single();
  if (letter?.docx_path) {
    await supabase.storage.from("patient-letters").remove([letter.docx_path]);
  }

  const { error } = await supabase.from("letters").delete().eq("id", letterId);
  if (error) throw error;

  revalidatePath(`/patients/${patientId}`);
}

export async function updateLetterContent(letterId: string, patientId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("letters").update({ content }).eq("id", letterId);
  if (error) throw error;

  revalidatePath(`/patients/${patientId}`);

  // Re-scan edited letter for updated blood test mentions
  extractAndUpdateBloods(patientId, content).catch(() => {});
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
