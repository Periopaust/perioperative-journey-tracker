import { createClient } from "@/lib/supabase/server";
import { extractTextFromUploads } from "@/lib/periop-extract";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a medical records assistant. Extract patient and referral details from the provided document text.

Return a JSON object with these fields (use null if not found):
{
  "full_name": "patient full name (no title)",
  "date_of_birth": "YYYY-MM-DD",
  "ur_number": "UR or patient number",
  "title": "Mr/Mrs/Ms/Miss/Dr/Prof etc",
  "referring_surgeon": "referring doctor full name e.g. Dr John Smith",
  "referring_practice": "referring practice or clinic",
  "referring_address": "referring doctor address",
  "planned_surgery": "planned procedure or surgery",
  "surgery_date": "YYYY-MM-DD or null",
  "hospital": "hospital name",
  "medicare_number": "Medicare number",
  "medicare_irn": "IRN digit (position on card)",
  "medicare_expiry": "MM/YY format",
  "dva_number": "DVA number if present",
  "health_fund": "private health fund name",
  "health_fund_number": "health fund membership number",
  "phone": "patient mobile or primary phone",
  "home_phone": "patient home phone if separate",
  "fax": "fax number",
  "email": "patient email address",
  "address": "patient street address",
  "suburb": "patient suburb",
  "state": "patient state (e.g. NSW, VIC)",
  "postcode": "patient postcode",
  "occupation": "patient occupation",
  "country_of_birth": "country of birth",
  "nok_name": "next of kin or emergency contact name",
  "nok_relationship": "next of kin relationship",
  "nok_phone": "next of kin phone",
  "reason_for_referral": "brief reason for referral"
}

IMPORTANT:
- full_name and date_of_birth are the most critical fields
- Convert date_of_birth formats like "01/01/1980" or "1 January 1980" to YYYY-MM-DD
- Remove titles (Mr/Mrs/Dr) from full_name but capture them in the title field
- Return ONLY valid JSON, no explanation`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const formData = await request.formData();
    const uploadedFiles = formData.getAll("files").filter((f): f is File => f instanceof File);
    const pastedText = ((formData.get("pastedText") as string | null) || "").trim();

    if (uploadedFiles.length === 0 && !pastedText) {
      return Response.json({ error: "No file or text provided" }, { status: 400 });
    }

    const { extractedText } = await extractTextFromUploads({ files: uploadedFiles, pastedText });

    if (!extractedText.trim()) {
      return Response.json({ error: "Could not read text from document" }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`,
    });

    const response = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract patient details from this referral:\n\n${extractedText.slice(0, 8000)}` },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const extracted = JSON.parse(raw);

    return Response.json({ extracted, rawText: extractedText.slice(0, 500) });
  } catch (err: any) {
    console.error("Referral extraction error:", err);
    return Response.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
