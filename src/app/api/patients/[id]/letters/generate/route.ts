import { createClient } from "@/lib/supabase/server";
import { extractTextFromUploads, extractClinicalDataWithAI, verifyLetterAgainstSource } from "@/lib/periop-extract";
import { GENERAL_LETTER_SYSTEM_PROMPT, buildGeneralLetterUserMessage, redactIdentifiers } from "@/lib/letter-template";
import { loadDictionary } from "@/lib/pipeline/dictionary";
import { postprocess } from "@/lib/pipeline/postprocess";
import OpenAI from "openai";

async function generateStructuredLetter(input: {
  redactedClinicalData: string;
  procedure: string;
  transcript?: string;
  surgeonName?: string;
  surgeryDate?: string;
  todayDate?: string;
  providerName?: string;
}) {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!azureApiKey || !azureEndpoint) {
    throw new Error("Azure OpenAI API key or endpoint is missing.");
  }

  const openai = new OpenAI({
    apiKey: azureApiKey,
    baseURL: `${azureEndpoint}/openai/v1`,
  });

  const userMessage = buildGeneralLetterUserMessage({
    redactedClinicalData: input.redactedClinicalData,
    transcript: input.transcript,
    referringDoctor: input.surgeonName,
    todayDate: input.todayDate,
    providerName: input.providerName,
  });

  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      { role: "system", content: GENERAL_LETTER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
  });

  return response.choices[0]?.message?.content || "";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: patient } = await supabase
      .from("patients")
      .select("full_name, date_of_birth, planned_surgery, surgery_date, referring_surgeon")
      .eq("id", id)
      .single();

    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    const formData = await request.formData();

    const uploadedFiles = formData.getAll("files").filter((f): f is File => f instanceof File);
    const pastedText = ((formData.get("pastedText") as string | null) || "").trim();
    const transcript = ((formData.get("transcript") as string | null) || "").trim();
    const docType = ((formData.get("docType") as string | null) || "general").trim();

    if (uploadedFiles.length === 0 && !pastedText && !transcript) {
      return Response.json({ error: "No file, pasted text, or transcript provided" }, { status: 400 });
    }

    const { extractedText, sourceLabels } = await extractTextFromUploads({
      files: uploadedFiles,
      pastedText,
    });

    const aiData = extractedText.trim()
      ? await extractClinicalDataWithAI(extractedText, docType)
      : {};

    const redactedClinicalData = redactIdentifiers(extractedText, {
      fullName: patient.full_name,
      dob: patient.date_of_birth,
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const todayDate = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

    const draftLetterText = await generateStructuredLetter({
      redactedClinicalData,
      procedure: aiData.procedure || patient.planned_surgery || "",
      transcript,
      surgeonName: patient.referring_surgeon || "",
      surgeryDate: patient.surgery_date
        ? new Date(patient.surgery_date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
        : "",
      todayDate,
      providerName: profile?.full_name || "Dr. Vora",
    });

    const verifiedLetterText = await verifyLetterAgainstSource(draftLetterText, {
      extractedClinicalData: redactedClinicalData,
      transcript,
    });

    // Post-processing (spec Section 3.3): shared dictionary re-check + AU
    // spelling, applied as a final pass without touching the letter's
    // structure (the fact-checking pass above already ran).
    const dictionary = await loadDictionary(supabase);
    const letterText = postprocess(verifiedLetterText, dictionary);

    return Response.json({
      letterText,
      aiData,
      source: sourceLabels.join(", ") || "Transcript only",
    });
  } catch (error: any) {
    console.error("Letter generation error:", error);
    return Response.json({ error: error?.message || "Failed to generate letter" }, { status: 500 });
  }
}
