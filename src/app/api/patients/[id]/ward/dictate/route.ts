import { createClient } from "@/lib/supabase/server";

async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error("Azure Speech not configured");

  const url = `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(buffer)], { type: mimeType }), "dictation.webm");
  form.append("definition", JSON.stringify({ locales: ["en-AU"] }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key },
    body: form,
  });

  if (!res.ok) throw new Error(`Azure Speech error: ${res.status}`);
  const result = await res.json();

  const combined = result.combinedPhrases?.map((p: any) => p.text).join(" ").trim();
  if (combined) return combined;
  return result.phrases?.map((p: any) => p.text).join(" ").trim() || "";
}

function buildClinicalNotePrompt(
  rawDictation: string,
  noteType: string,
  problemList: string[],
  patient: any,
  glossary: { wrong_term: string; correct_term: string }[],
) {
  const activeProblems = problemList.length > 0
    ? problemList.map((p) => `- ${p}`).join("\n")
    : "No active problem list documented.";

  const glossaryLines = glossary.length > 0
    ? `\nUSER CORRECTIONS (apply these first — highest priority):\n${glossary.map((g) => `  "${g.wrong_term}" → "${g.correct_term}"`).join("\n")}\n`
    : "";

  return `You are an experienced Australian Consultant Physician.

Convert rough bedside dictation into professional clinical documentation.

Rules:
- Use Australian spelling and medical terminology.
- Never invent facts, examination findings, or investigation results not stated.
- Expand common medical abbreviations appropriately.
- Correct obvious speech recognition errors where clinically clear. Built-in corrections:
  - "Wara" or "Vara" or "Wora" → Vohra (clinician surname)
  - "Paralexia", "Paraxia", "Palexa" → Palexia (tapentadol, opioid analgesic)
  - "Tarkin" → Targin
  - "Andon" or "Endon" → Endone
  - "hyponatremia" → hyponatraemia (Australian spelling)
  - "edema" → oedema
  - "hemoglobin" → haemoglobin
  - "anesthetic" → anaesthetic
  - "paraesthesia" / "paraesthesiae" — Australian spelling
- Remove repetition, filler words ("um", "uh", "sort of", "you know"), and false starts.
- Preserve all clinical meaning and detail.
- If information is missing, leave the section blank or write "Not documented".
- The clinician will review and edit before use.
${glossaryLines}

PATIENT CONTEXT
Ward/Location: ${patient?.ward_location || "Not documented"}
Planned procedure: ${patient?.planned_surgery || "Not documented"}

ACTIVE PROBLEM LIST
${activeProblems}

NOTE TYPE: ${noteType}

RAW DICTATION
${rawDictation}

FORMAT INSTRUCTIONS

If note type = "Simple ward round":
WARD ROUND NOTE

Subjective

Objective

Assessment

Plan


If note type = "Complex ward round":
CONSULTANT WARD ROUND

Interval History

Active Problems
[list each problem with today's update]

Examination

Investigations

Assessment

Problem Based Plan
[one section per active problem with actions]

Discharge Planning


If note type = "Progress note":
PROGRESS NOTE

[Write as a single flowing clinical paragraph summarising the patient's status, clinical findings, and trajectory. Do not use subheadings. Do not use Subjective/Objective/Assessment/Plan. Write in the style of a consultant's progress note — concise, clinical, third person.]

Plan:
- [bullet]
- [bullet]


If note type = "Admission note":
ADMISSION NOTE

Presenting Problem

History of Present Illness

Relevant Background

Examination

Investigations

Assessment

Active Problem List

Plan


If note type = "Initial consult":
CONSULTANT PHYSICIAN REVIEW

Reason for Review

Background

Current Clinical Issues

Assessment

Recommendations


If note type = "Handover note":
MEDICAL HANDOVER

Background

Current Issues

Outstanding Tasks

Potential Concerns

Escalation Instructions


If note type = "Discharge summary draft":
DISCHARGE SUMMARY DRAFT

Admission Diagnosis

Secondary Diagnoses

Clinical Course

Investigations

Treatment

Discharge Medications

Follow Up

GP Actions

Discharge Plan


Return only the completed note.`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { id: patientId } = await params;

  const formData = await request.formData();
  const audio = formData.get("audio");
  const noteType = String(formData.get("noteType") || "Progress note");
  const problemListRaw = formData.get("problemList");
  const problemList: string[] = problemListRaw ? JSON.parse(String(problemListRaw)) : [];

  if (!(audio instanceof File)) {
    return Response.json({ error: "No audio file provided" }, { status: 400 });
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return Response.json({ error: "Azure OpenAI not configured" }, { status: 500 });
  }

  // Step 1: Transcribe with Azure Speech
  const buffer = Buffer.from(await audio.arrayBuffer());
  let rawTranscript: string;
  try {
    rawTranscript = await transcribeAudio(buffer, audio.type || "audio/webm");
  } catch (err: any) {
    return Response.json({ error: err.message || "Transcription failed" }, { status: 500 });
  }

  if (!rawTranscript) {
    return Response.json({ error: "No speech detected in recording" }, { status: 422 });
  }

  // Step 2: Fetch patient context + vocabulary corrections in parallel
  const [{ data: patient }, { data: glossaryData }] = await Promise.all([
    supabase.from("patients").select("ward_location, planned_surgery").eq("id", patientId).single(),
    supabase.from("vocabulary_corrections").select("wrong_term, correct_term"),
  ]);

  const glossary = glossaryData ?? [];

  // Step 3: Format directly into structured clinical note (single AI call)
  const prompt = buildClinicalNotePrompt(rawTranscript, noteType, problemList, patient, glossary);

  const aiRes = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You convert rough Australian physician dictation into structured consultant physician documentation.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    }
  );

  if (!aiRes.ok) {
    return Response.json({ error: "AI formatting failed" }, { status: aiRes.status });
  }

  const aiData = await aiRes.json();
  const formattedNote = aiData.choices?.[0]?.message?.content || "";

  return Response.json({ rawTranscript, formattedNote });
}
