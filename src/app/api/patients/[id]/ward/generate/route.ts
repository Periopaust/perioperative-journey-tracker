import { createClient } from "@/lib/supabase/server";
import { loadDictionary } from "@/lib/pipeline/dictionary";
import { postprocess } from "@/lib/pipeline/postprocess";
import { getAppConfig } from "@/lib/pipeline/prompt";

const PROMPTS: Record<string, (ctx: GenerateContext) => string> = {
  "Allied Health Summary": (ctx) => `You are an Australian consultant physician generating an allied health referral summary.

Summarise the patient's clinical situation for the allied health team. Do not invent clinical facts. Write "Not documented" if information is missing.

PATIENT
Ward/Location: ${ctx.ward_location || "Not documented"}
Planned procedure: ${ctx.planned_surgery || "Not documented"}
Active problem list: ${ctx.problem_list}

WARD NOTES
${ctx.notes}

Return exactly in this format:

ALLIED HEALTH REFERRAL SUMMARY

Current Admission Diagnosis

Relevant Medical Background

Functional Status (pre-admission)

Current Clinical Issues Relevant to Allied Health

Specific Allied Health Referrals Suggested
(e.g. Physiotherapy, Occupational Therapy, Social Work, Dietitian, Speech Pathology, Pharmacy)

Physiotherapy
Goal:
Key Issues:

Occupational Therapy
Goal:
Key Issues:

Social Work
Goal:
Key Issues:

Discharge Barriers from Allied Health Perspective

Goals for Discharge`,
  "Ward Round Plan": (ctx) => `You are an Australian consultant physician preparing a ward round plan.

Use the available patient information to generate a practical consultant-level ward round plan.
Do not invent facts. If information is not documented, write "Not documented".
Prioritise safety, discharge planning, active medical issues, medications, investigations and allied health barriers.

PATIENT
Ward/Location: ${ctx.ward_location || "Not documented"}
Planned procedure: ${ctx.planned_surgery || "Not documented"}
Active problem list: ${ctx.problem_list}

WARD NOTES
${ctx.notes}

Return exactly in this format:

WARD ROUND PLAN

1. Key Active Issues Today

2. Questions to Ask Patient / Nursing Staff

3. Examination Focus

4. Investigations to Check / Order

5. Medication Issues

6. Allied Health / Functional / Discharge Issues

7. Today's Jobs

8. Discharge Barriers

9. Escalation / Safety Concerns

10. Suggested Progress Note`,

  "Handover": (ctx) => `You are an Australian consultant physician generating a medical handover document.

Use the ward notes and patient context. Do not invent facts. Write "Not documented" if information is missing.

PATIENT
Ward/Location: ${ctx.ward_location || "Not documented"}
Planned procedure: ${ctx.planned_surgery || "Not documented"}
Active problem list: ${ctx.problem_list}

WARD NOTES
${ctx.notes}

Return exactly in this format:

MEDICAL HANDOVER

Patient Summary

Active Problems
[Numbered list with current status of each problem]

Recent Changes / Events

Pending Results / Actions

Overnight Jobs

Escalation Instructions`,

  "Discharge Summary": (ctx) => `You are an Australian consultant physician generating a discharge summary draft.

Use only documented information. Do not invent clinical facts. Use Australian spelling.
Mark any section as "Not documented" if the information is not available in the notes.

PATIENT
Ward/Location: ${ctx.ward_location || "Not documented"}
Planned procedure: ${ctx.planned_surgery || "Not documented"}
Active problem list: ${ctx.problem_list}

WARD NOTES
${ctx.notes}

Return exactly in this format:

DISCHARGE SUMMARY DRAFT

Admission Diagnosis

Secondary Diagnoses

Clinical Course

Investigations

Procedures / Treatment

Complications

Discharge Medications
(List medications — if not documented, write "To be completed")

Follow Up Arrangements

GP Actions Required

Discharge Condition

Discharge Plan`,
};

type GenerateContext = {
  ward_location: string | null;
  planned_surgery: string | null;
  problem_list: string;
  notes: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { id: patientId } = await params;
  const { type } = await request.json();

  if (!type || !PROMPTS[type]) {
    return Response.json({ error: "Invalid generation type" }, { status: 400 });
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return Response.json({ error: "Azure OpenAI not configured" }, { status: 500 });
  }

  const [{ data: patient }, { data: notes }, dictionary, appConfig] = await Promise.all([
    supabase
      .from("patients")
      .select("ward_location, planned_surgery, problem_list")
      .eq("id", patientId)
      .single(),
    supabase
      .from("ward_notes")
      .select("note_type, note_text, created_at, author_name")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: true }),
    loadDictionary(supabase),
    getAppConfig(supabase),
  ]);

  const problemList = Array.isArray(patient?.problem_list) && patient.problem_list.length > 0
    ? patient.problem_list.join(", ")
    : "None documented";

  const notesText = (notes ?? [])
    .map((n) => `[${n.note_type}] ${new Date(n.created_at).toLocaleDateString("en-AU")}${n.author_name ? ` — ${n.author_name}` : ""}\n${n.note_text}`)
    .join("\n\n---\n\n");

  const ctx: GenerateContext = {
    ward_location: patient?.ward_location ?? null,
    planned_surgery: patient?.planned_surgery ?? null,
    problem_list: problemList,
    notes: notesText || "No ward notes documented.",
  };

  const prompt = PROMPTS[type](ctx);

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
        max_tokens: 2000,
      }),
    }
  );

  if (!response.ok) {
    return Response.json({ error: "AI generation failed" }, { status: response.status });
  }

  const data = await response.json();
  const rawOutput = data.choices?.[0]?.message?.content ?? "";

  // Post-processing (spec Section 3.3): dictionary re-check + AU spelling.
  const output = postprocess(rawOutput, dictionary);

  return Response.json({ output });
}
