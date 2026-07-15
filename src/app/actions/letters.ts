"use server";

import { createClient } from "@/lib/supabase/server";
import { letterTextToDocxBuffer } from "@/lib/letter-docx";
import { revalidatePath } from "next/cache";
import { extractAndUpdateBloods } from "./patients";
import { diffAndLogCorrections } from "@/lib/pipeline/corrections";

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

  // Next.js redacts the real error message from a thrown Server Action error
  // in production (the client only ever sees a generic "error occurred in
  // the Server Components render" digest). To keep the actual failure
  // reason visible in the UI, this action catches its own errors and
  // returns `{ error }` instead of throwing.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: patient } = await supabase
      .from("patients")
      .select("ur_number")
      .eq("id", patientId)
      .single();

    if (!patient) return { error: "Patient not found" };

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

    // upsert: true — the letter number is computed from existing DB rows,
    // not from what's already in storage, so if an earlier save attempt
    // uploaded the docx but failed before the DB insert (e.g. a race or a
    // transient error), a retry recomputes the same code and path. Without
    // upsert this fails with "The resource already exists" and blocks the
    // clinician from ever saving that letter.
    const { error: uploadError } = await supabase.storage
      .from("patient-letters")
      .upload(docxPath, docxBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (uploadError) return { error: `Could not upload document: ${uploadError.message}` };

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

    if (insertError) return { error: `Could not save letter: ${insertError.message}` };

    revalidatePath(`/patients/${patientId}`);

    // Silently scan letter for blood test mentions and auto-update patient status
    extractAndUpdateBloods(patientId, letterText).catch(() => {});

    return { letterCode };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to save letter" };
  }
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

  // Grab the pre-edit content so we can log what the clinician actually
  // changed (spec Section 3.4) before it's overwritten.
  const { data: existing } = await supabase.from("letters").select("content").eq("id", letterId).single();

  const { error } = await supabase.from("letters").update({ content }).eq("id", letterId);
  if (error) throw error;

  revalidatePath(`/patients/${patientId}`);

  // Re-scan edited letter for updated blood test mentions
  extractAndUpdateBloods(patientId, content).catch(() => {});

  // Correction logging: diff the AI/previous draft against what was saved.
  if (existing?.content) {
    diffAndLogCorrections(supabase, {
      originalText: existing.content,
      correctedText: content,
      userId: user.id,
    }).catch(() => {});
  }
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
