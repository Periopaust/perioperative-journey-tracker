import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { id: patientId } = await params;
  const { rawNote, noteType, problemList } = await request.json();

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return Response.json({ error: "Azure OpenAI not configured" }, { status: 500 });
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, date_of_birth, ward_location, planned_surgery")
    .eq("id", patientId)
    .single();

  const activeProblems = Array.isArray(problemList) && problemList.length > 0
    ? problemList.map((p: string) => `- ${p}`).join("\n")
    : "No active problem list documented.";

  const prompt = `You are an experienced Australian Consultant Physician.

Convert rough bedside dictation into professional clinical documentation.

Rules:
- Use Australian spelling and medical terminology.
- Never invent facts, examination findings, or investigation results not stated.
- If information is missing, leave the section blank or write "Not documented".
- Expand common medical abbreviations appropriately.
- Correct obvious speech recognition errors where clinically clear.
- Preserve all clinical meaning. Remove repetition and filler words.
- Use the active problem list to structure the note where relevant.
- The clinician will review and edit before use.

PATIENT CONTEXT
Ward/Location: ${patient?.ward_location || "Not documented"}
Planned procedure: ${patient?.planned_surgery || "Not documented"}

ACTIVE PROBLEM LIST
${activeProblems}

NOTE TYPE: ${noteType}

RAW DICTATION
${rawNote}

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
[list problems with updates]
Examination
Investigations
Assessment
Problem Based Plan
[one section per active problem]
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

  const response = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You convert Australian physician dictation into structured consultant physician documentation." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    }
  );

  if (!response.ok) {
    return Response.json({ error: "AI request failed" }, { status: response.status });
  }

  const data = await response.json();
  const cleanedNote = data.choices?.[0]?.message?.content ?? "";
  return Response.json({ cleanedNote });
}
