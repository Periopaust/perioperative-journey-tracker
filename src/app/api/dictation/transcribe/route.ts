import { createClient } from "@/lib/supabase/server";
import { cleanDictationTranscript } from "@/lib/periop-extract";

async function transcribeWithAzureSpeech(buffer: Buffer, mimeType: string) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    throw new Error("Azure Speech key or region is missing.");
  }

  const url = `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;

  const definition = JSON.stringify({ locales: ["en-AU"] });

  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(buffer)], { type: mimeType }), "dictation.webm");
  form.append("definition", definition);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure Speech transcription failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  const combined = result.combinedPhrases?.map((p: any) => p.text).join(" ").trim();
  if (combined) return combined;

  const phrases = result.phrases?.map((p: any) => p.text).join(" ").trim();
  return phrases || "";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return Response.json({ error: "No audio provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const rawTranscript = await transcribeWithAzureSpeech(buffer, audio.type || "audio/webm");

    if (!rawTranscript) {
      return Response.json({ error: "No speech detected in recording" }, { status: 422 });
    }

    // Load user's saved vocabulary corrections and pass to cleanup
    const { data: glossary } = await supabase
      .from("vocabulary_corrections")
      .select("wrong_term, correct_term");

    const cleanedTranscript = await cleanDictationTranscript(rawTranscript, glossary ?? []);

    return Response.json({ rawTranscript, cleanedTranscript });
  } catch (error: any) {
    console.error("Dictation transcription error:", error);
    return Response.json({ error: error?.message || "Failed to transcribe dictation" }, { status: 500 });
  }
}
