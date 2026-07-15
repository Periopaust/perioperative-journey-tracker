import { createClient } from "@/lib/supabase/server";
import { loadDictionary, preprocess } from "@/lib/pipeline/dictionary";
import { postprocess } from "@/lib/pipeline/postprocess";
import { getAppConfig } from "@/lib/pipeline/prompt";

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

  const [{ data: patient }, dictionary, appConfig] = await Promise.all([
    supabase
      .from("patients")
      .select("full_name, date_of_birth, ward_location, planned_surgery")
      .eq("id", patientId)
      .single(),
    loadDictionary(supabase),
    getAppConfig(supabase),
  ]);

  const activeProblems = Array.isArray(problemList) && problemList.length > 0
    ? problemList.map((p: string) => `- ${p}`).join("\n")
    : "No active problem list documented.";

  // Pre-processing (spec Section 3.1): fuzzy-match the raw note against the
  // shared dictionary before it reaches the LLM.
  const preprocessedNote = preprocess(rawNote, dictionary);

  const prompt = `You are an experienced Australian Consultant Physician.

Convert rough bedside dictation into professional clinical documentation.

Rules:
- Use Australian spelling and medical terminology.
- Expand common medical abbreviations appropriately.
- Correct obvious speech recognition errors where clinically clear.
- Preserve all clinical meaning. Remove repetition and filler words.
- Use the active problem list to structure the note where relevant.
- The clinician will review and edit before use.

ZERO-FABRICATION RULE — THIS OVERRIDES EVERYTHING ELSE, INCLUDING THE FORMAT BELOW:
- Only include a symptom, vital sign, examination finding, or investigation result if it is explicitly stated in the RAW DICTATION below. Do NOT infer or invent a finding because it is commonly associated with the patient's presentation or diagnosis — for example, never write "febrile", "afebrile", a temperature, blood pressure, heart rate, respiratory rate, or oxygen saturation unless the clinician actually said it.
- If a heading in the required format has nothing documented in the dictation, OMIT THAT HEADING AND ITS CONTENT ENTIRELY. Do NOT write "Not documented", "Nil", "N/A", "nil acute findings", or leave a blank line under a heading with nothing to put there — just leave the heading out of the note completely.
- The one exception is the Active Problem List / Active Problems heading: populate it from the ACTIVE PROBLEM LIST provided below (clinician-maintained data, not part of the dictation), even if it isn't restated in the raw dictation.
- A short, sparse note that reflects only what was actually said is correct and expected. A comprehensive-looking note with invented vitals, exam findings, or results is a serious clinical safety error.
- Before finalising, check every clinical statement traces back to something explicitly said in the raw dictation (or the active problem list, for that one section). If it does not, delete it.

PATIENT CONTEXT
Ward/Location: ${patient?.ward_location || "Not documented"}
Planned procedure: ${patient?.planned_surgery || "Not documented"}

ACTIVE PROBLEM LIST
${activeProblems}

NOTE TYPE: ${noteType}

RAW DICTATION
${preprocessedNote}

FORMAT INSTRUCTIONS (omit any heading below that has nothing documented for it, per the zero-fabrication rule above)

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
          { role: "system", content: appConfig.systemPrompt },
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
  const rawCleanedNote = data.choices?.[0]?.message?.content ?? "";

  // Post-processing (spec Section 3.3): dictionary re-check + AU spelling.
  const cleanedNote = postprocess(rawCleanedNote, dictionary);

  return Response.json({ cleanedNote });
}
