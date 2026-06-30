import { createClient } from "@/lib/supabase/server";
import { extractTextFromUploads, extractClinicalDataWithAI, verifyLetterAgainstSource } from "@/lib/periop-extract";
import { COMMAND_LETTER_SYSTEM_PROMPT, buildCommandUserMessage, redactIdentifiers } from "@/lib/letter-template";
import OpenAI from "openai";

async function generateFromCommand(input: {
  redactedClinicalData: string;
  command: string;
  transcript?: string;
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

  const userMessage = buildCommandUserMessage({
    command: input.command,
    redactedClinicalData: input.redactedClinicalData,
    transcript: input.transcript,
  });

  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      { role: "system", content: COMMAND_LETTER_SYSTEM_PROMPT },
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
      .select("full_name, date_of_birth")
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
    const command = ((formData.get("command") as string | null) || "").trim();

    if (!command) {
      return Response.json({ error: "No instruction provided" }, { status: 400 });
    }

    if (uploadedFiles.length === 0 && !pastedText && !transcript) {
      return Response.json({ error: "No file, pasted text, or transcript provided" }, { status: 400 });
    }

    const { extractedText } = await extractTextFromUploads({
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

    const draftLetterText = await generateFromCommand({
      redactedClinicalData,
      command,
      transcript,
    });

    const letterText = await verifyLetterAgainstSource(draftLetterText, {
      extractedClinicalData: redactedClinicalData,
      transcript,
    });

    return Response.json({ letterText, aiData });
  } catch (error: any) {
    console.error("Command generation error:", error);
    return Response.json({ error: error?.message || "Failed to generate document" }, { status: 500 });
  }
}
