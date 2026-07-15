import OpenAI from "openai";

function getAzureOpenAIClient() {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!azureApiKey || !azureEndpoint) {
    throw new Error("Azure OpenAI API key or endpoint is missing.");
  }

  return new OpenAI({
    apiKey: azureApiKey,
    baseURL: `${azureEndpoint}/openai/v1`,
  });
}

/**
 * Cleans up a raw speech-to-text transcript: fixes punctuation, removes filler
 * words and false starts, and corrects obvious medical-term mis-transcriptions
 * (e.g. drug names) without adding, removing, or reinterpreting clinical content.
 */
export async function cleanDictationTranscript(rawTranscript: string, glossary: { wrong_term: string; correct_term: string }[] = []) {
  const openai = getAzureOpenAIClient();

  const glossaryLines = glossary.length > 0
    ? `\nKNOWN CORRECTIONS (apply these first, before any other corrections):\n${glossary.map(g => `  "${g.wrong_term}" → "${g.correct_term}"`).join("\n")}`
    : "";

  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      {
        role: "system",
        content: `You clean up raw speech-to-text transcripts of clinical dictation for a peri-operative physician working in Australia.
${glossaryLines}

RULES:
1. Fix punctuation, capitalisation, and sentence breaks.
2. Remove filler words ("um", "uh", "like", "sort of", "you know"), false starts, and stutter repeats.
3. Apply the KNOWN CORRECTIONS list above exactly — these are user-confirmed fixes.
4. MEDICATION NAMES — use Australian brand names and correct spellings. Common examples:
   - Palexia (tapentadol, opioid analgesic) — not Paralexia, Paraxia, Palexa, Palecia
   - Targin (oxycodone/naloxone) — not Tarkin, Target, Targen
   - Endone (oxycodone immediate release) — not Andon, Endon
   - Karvezide (irbesartan/HCTZ) — not Carbizide, Carbezide, Karbizide
   - Notan (atenolol brand) — capitalise
   - Vytorin (ezetimibe/simvastatin)
   - Lyrica (pregabalin) — not Lyrika, Lirica
   - Mobic (meloxicam)
   - Tixol (tianeptine)
   - Slinda (progesterone-only contraceptive pill) — not Slender, Slinder, Slim, Slider
   - Symbicort (budesonide/formoterol inhaler) — only use if clearly stated; do NOT substitute for other medications
   - Ozempic (semaglutide) — not Osempic, Ozempik
   - Jardiance (empagliflozin) — not Gardiance, Jardians
   - Eliquis (apixaban) — not Aliquis, Eliqus
   - Xarelto (rivaroxaban) — not Zarelto, Zaralto
   - Apixaban, rivaroxaban, dabigatran — correct full spelling
   - Metformin, atorvastatin, ramipril, perindopril — standard spellings
   - Hyponatraemia — not hyponatremia (Australian spelling)
   - Sodium osmolality, serum osmolality — not sodium osmolality misheard
   - CRITICAL: Never substitute one medication name for another that sounds similar. If uncertain, preserve what was said phonetically rather than guessing a different drug.
5. CLINICAL DESCRIPTORS — correct obvious mis-transcriptions of clinical terms:
   - "neuropathic" not "neurotic"
   - "paraesthesia" / "paraesthesiae" (Australian spelling, not "paresthesia")
   - "oedema" not "edema" (Australian/British spelling)
   - "haemoglobin" not "hemoglobin"
   - "anaesthetic" not "anesthetic"
   - Spinal levels: C1–C8, T1–T12, L1–L5, S1–S5 — always capitalise and hyphenate
   - "bilateral" not "by lateral"
6. INSTITUTION NAMES — correct obvious mis-transcriptions of Australian hospital/facility names:
   - "Robinvale Hospital" — not Robinville, Robin Oil, Robin Wall
   - "The Alfred" (Alfred Hospital, Melbourne) — not "the health rd", "the Alfred rd"
   - "Royal Melbourne Hospital" — not "Royal Melbourne"
   - Other well-known Australian hospitals: Royal Adelaide, PA Hospital, Prince of Wales, Westmead, etc.
   - If a place name is unclear but sounds like an Australian hospital, capitalise it and preserve the closest interpretation
7. PROVIDER NAMES — capitalise correctly (e.g. "Dr Vohra" not "doctor bora" or "dr vora")
8. Do NOT add, remove, infer, or reinterpret any clinical content, facts, diagnoses, or instructions.
9. Do NOT summarise. Preserve the full detail of every speaker — including the patient's words. Patient-reported medications, diagnoses, surgical history, and symptoms must be kept verbatim (corrected for spelling only). A patient listing "Slinda, Ventolin" must appear as "Slinda, Ventolin" — never collapsed or substituted.
10. Output plain text only — no markdown, no commentary, no headings.
11. If a medication, procedure, or proper noun sounds unfamiliar but is phonetically plausible (e.g. a drug name you don't recognise), preserve it as-is rather than substituting a similar-sounding alternative.`,
      },
      { role: "user", content: rawTranscript },
    ],
    temperature: 0,
  });

  return response.choices[0]?.message?.content?.trim() || rawTranscript;
}

/**
 * Second-pass grounding check: re-reads a generated draft against the original
 * source material and strips/flags any clinical statement that isn't explicitly
 * supported by the source, without altering formatting or structure. This catches
 * fabrication that the generation prompt's own anti-fabrication rule missed.
 */
export async function verifyLetterAgainstSource(
  letterText: string,
  source: { extractedClinicalData?: string; transcript?: string }
) {
  const hasDocuments = !!source.extractedClinicalData?.trim();
  const hasTranscript = !!source.transcript?.trim();

  if (!hasDocuments && !hasTranscript) return letterText;

  const openai = getAzureOpenAIClient();

  const sourceSections = [
    hasDocuments ? `EXTRACTED CLINICAL DATA / DOCUMENTS:\n${source.extractedClinicalData!.trim()}` : "",
    hasTranscript ? `CONSULTATION TRANSCRIPT (highest-priority source):\n${source.transcript!.trim()}` : "",
  ].filter(Boolean).join("\n\n");

  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      {
        role: "system",
        content: `You are a strict fact-checker for AI-generated clinical letters. You will be given SOURCE material (the only material the letter is allowed to be based on, split into "extracted clinical data / documents" and "consultation transcript") and a DRAFT letter generated from it.

Your job: re-read every clinical statement in the DRAFT (diagnoses, conditions, medications, doses, dates, test results, procedures, social history, anything presented as fact) and check it against the SOURCE.

SOURCE PRIORITY: if the documents and the transcript disagree about a fact (e.g. documents list a medication the transcript shows the patient denies taking, or a different dose), the TRANSCRIPT is authoritative — the DRAFT should reflect the transcript's version, not the document's. This is correct behaviour, not a fabrication, so do not "fix" a transcript-confirmed fact back to match an outdated document.

For each statement that is NOT explicitly supported by EITHER source (after applying the priority rule above):
- If it is a fabricated fact with no basis at all (e.g. a condition never mentioned anywhere, an invented date, an invented numeric result), remove it or replace it with "[not documented — please verify]".
- If a source stated something more vague or uncertain than the DRAFT claims (e.g. source says "a valve replacement, type uncertain" but DRAFT says "bioprosthetic valve"), rewrite the DRAFT's statement to match that source's actual level of certainty.
- If the DRAFT converted an approximate timeframe into a specific date that no source gave, revert it to the approximate timeframe.

Do NOT remove or alter anything that IS supported by the higher-priority source, even if it contradicts the other source or you wouldn't have phrased it that way. Do NOT change the letter's structure, headings, formatting, bullet style, or markdown bold markers — only fix unsupported content in place. Do NOT add commentary, a summary of changes, or anything outside the corrected letter itself.

Output ONLY the corrected letter text, nothing else.`,
      },
      {
        role: "user",
        content: `SOURCE:\n${sourceSections}\n\nDRAFT LETTER:\n${letterText}`,
      },
    ],
    temperature: 0,
  });

  return response.choices[0]?.message?.content?.trim() || letterText;
}

/**
 * Cheap, dependency-free heuristic for detecting a password/permission-protected
 * PDF before sending it to Azure. Azure Document Intelligence cannot parse encrypted
 * PDF content streams — even ones that open without a password prompt — and returns
 * an opaque "UnsupportedContent" 400 error for them. Real-world example: PDFs
 * exported from some hospital admission/referral portals are saved with owner-
 * password permission restrictions by default. Catching this up front lets us give
 * the clinician something actionable instead of a raw Azure error dialog.
 *
 * This is a heuristic, not a full PDF parser: it scans the raw bytes for the
 * "/Encrypt" trailer key that PDF encryption dictionaries use. It can very rarely
 * miss unusual encrypted PDFs, but it will never incorrectly flag a normal
 * unencrypted PDF, so the worst case if it misses is the same Azure error as today.
 */
function isPdfEncrypted(buffer: Buffer): boolean {
  return buffer.includes(Buffer.from("/Encrypt"));
}

async function extractTextWithAzureOCR(buffer: Buffer, fileType: string) {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !key) {
    throw new Error("Azure OCR endpoint or key is missing.");
  }

  const cleanEndpoint = endpoint.replace(/\/$/, "");

  const analyzeUrl = `${cleanEndpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&features=ocrHighResolution,keyValuePairs`;

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": fileType || "application/pdf",
    },
    body: new Uint8Array(buffer),
  });

  if (!analyzeResponse.ok) {
    const errorText = await analyzeResponse.text();
    throw new Error(`Azure OCR request failed: ${analyzeResponse.status} ${errorText}`);
  }

  const operationLocation = analyzeResponse.headers.get("operation-location");

  if (!operationLocation) {
    throw new Error("Azure OCR did not return an operation-location header.");
  }

  for (let attempt = 0; attempt < 45; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const resultResponse = await fetch(operationLocation, {
      method: "GET",
      headers: { "Ocp-Apim-Subscription-Key": key },
    });

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      throw new Error(`Azure OCR result failed: ${resultResponse.status} ${errorText}`);
    }

    const result = await resultResponse.json();

    if (result.status === "succeeded") {
      const content = result.analyzeResult?.content || "";
      const tables = result.analyzeResult?.tables || [];
      const keyValuePairs = result.analyzeResult?.keyValuePairs || [];

      const tableText = tables
        .map((table: any, tableIndex: number) => {
          const cells = table.cells || [];
          return [
            `TABLE ${tableIndex + 1}`,
            ...cells.map((cell: any) => `Row ${cell.rowIndex}, Col ${cell.columnIndex}: ${cell.content}`),
          ].join("\n");
        })
        .join("\n\n");

      const keyValueText = keyValuePairs
        .map((pair: any, index: number) => {
          const keyText = pair.key?.content || "";
          const valueText = pair.value?.content || "";
          return `KeyValue ${index + 1}: ${keyText} = ${valueText}`;
        })
        .join("\n");

      return `
FULL OCR TEXT:
${content}

EXTRACTED TABLES:
${tableText}

EXTRACTED KEY VALUE PAIRS:
${keyValueText}
`.trim();
    }

    if (result.status === "failed") {
      throw new Error("Azure OCR failed to analyse the document.");
    }
  }

  throw new Error("Azure OCR timed out while waiting for result.");
}

export async function extractTextFromUploads(input: {
  files: File[];
  pastedText?: string;
}) {
  let extractedText = "";
  const sourceLabels: string[] = [];

  if (input.pastedText && input.pastedText.trim()) {
    extractedText += `\n\n--- SOURCE: PASTED TEXT ---\n${input.pastedText.trim()}`;
    sourceLabels.push("Pasted text");
  }

  for (const file of input.files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let fileText = "";

    const name = file.name.toLowerCase();
    const mime = file.type;

    if (mime === "text/plain" || name.endsWith(".txt")) {
      fileText = buffer.toString("utf-8");
    } else if (
      mime === "application/pdf" || name.endsWith(".pdf") ||
      mime.startsWith("image/") ||
      name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") ||
      name.endsWith(".tiff") || name.endsWith(".tif") || name.endsWith(".bmp") ||
      name.endsWith(".heic") || name.endsWith(".heif") ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx") ||
      mime === "application/msword" || name.endsWith(".doc")
    ) {
      // Determine the correct content-type for Azure Document Intelligence
      let contentType = mime;
      if (!contentType || contentType === "application/octet-stream") {
        if (name.endsWith(".pdf")) contentType = "application/pdf";
        else if (name.endsWith(".docx")) contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (name.endsWith(".doc")) contentType = "application/msword";
        else if (name.endsWith(".png")) contentType = "image/png";
        else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (name.endsWith(".tiff") || name.endsWith(".tif")) contentType = "image/tiff";
        else if (name.endsWith(".bmp")) contentType = "image/bmp";
        else if (name.endsWith(".heic") || name.endsWith(".heif")) contentType = "image/heif";
        else contentType = "application/pdf";
      }
      if (contentType === "application/pdf" && isPdfEncrypted(buffer)) {
        // Known, common failure mode — give a specific, actionable message rather
        // than letting the raw Azure 400 reach the clinician.
        fileText = `[Could not read "${file.name}" automatically — this PDF is password/permission-protected, which the OCR service can't open. Please open it, save an unlocked copy (e.g. "Save As" or "Print to PDF" with security removed), and re-upload that copy. The rest of this letter was generated from your other sources.]`;
      } else {
        try {
          fileText = await extractTextWithAzureOCR(buffer, contentType);
        } catch (ocrError: any) {
          // Don't let one bad file kill the whole letter — degrade gracefully and
          // keep going with whatever other sources (files, transcript, pasted text)
          // are available, same as the unsupported-file-type branch below already does.
          fileText = `[Could not read "${file.name}" automatically (${ocrError?.message || "OCR failed"}). Please check the file opens normally, or paste its content manually. The rest of this letter was generated from your other sources.]`;
        }
      }
    } else {
      fileText = `[File type not supported for OCR: ${file.name} (${mime || "unknown type"}). Please paste the text content manually.]`;
    }

    extractedText += `\n\n--- SOURCE FILE: ${file.name} ---\n${fileText}`;
    sourceLabels.push(file.name);
  }

  return { extractedText, sourceLabels };
}

export async function extractClinicalDataWithAI(text: string, docType: string) {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!azureApiKey || !azureEndpoint) {
    throw new Error("Azure OpenAI API key or endpoint is missing.");
  }

  const openai = new OpenAI({
    apiKey: azureApiKey,
    baseURL: `${azureEndpoint}/openai/v1`,
  });

  const prompt = `
You are a consultant peri-operative physician.

DOCUMENT TYPE:
${docType}

INTERPRETATION RULE:
- If document type is "medications", prioritise extracting medications and allergies.
- If "rfa", prioritise surgical details, procedure, hospital, and comorbidities.
- If "referral", prioritise clinical summary and diagnoses.
- If "pathology", prioritise labs.
- If "ecg", prioritise ECG interpretation.

IMPORTANT:
You MUST return ONLY valid JSON.
Do NOT include markdown.
Do NOT include explanations.
Do NOT include text outside JSON.

Return this exact JSON structure:

{
  "procedure": "",
  "surgeon": "",
  "hospital": "",
  "urgency": "",
  "diagnoses": "",
  "pmhx": "",
  "medications": "",
  "allergy": "",
  "hb": "",
  "creatinine": "",
  "ecg": "",
  "anaestheticHistory": "",
  "smoking": "",
  "alcohol": "",
  "osa": "",
  "cpap": "",
  "functionalCapacity": "",
  "frailty": "",
  "supports": "",
  "mobility": "",
  "fallsRisk": "",
  "investigations": "",
  "clinicalSummary": ""
}

Rules:
- Do not invent facts.
- Use empty string if information is not present.
- Do not extract or return patient name or date of birth — those are already known from the patient record and must not appear in this output.
- "procedure" should be the planned operation only.
- If waiting list for total hip replacement is mentioned, set procedure to "Total hip replacement".
- "diagnoses" should include the main active clinical/surgical diagnoses.
- "pmhx" should include TRUE background medical comorbidities only.
- Do not repeat the presenting complaint or procedure in pmhx.
- "clinicalSummary" should be 2-3 concise sentences describing the current clinical problem, functional impact, and reason for peri-operative review.

Past medical history extraction:
- Pay special attention to EXTRACTED TABLES and EXTRACTED KEY VALUE PAIRS.
- Past medical history may appear in tables under "Past History" with columns "Date" and "Condition".
- Extract all clinically meaningful conditions from those tables into pmhx.
- Include conditions such as hypertension, osteoarthritis, osteoporosis, depression, spinal stenosis, cervical spondylosis, hip pain, chronic pain, atrial fibrillation, CKD, diabetes, IHD, COPD, OSA if documented.

Medication extraction:
- Pay special attention to EXTRACTED TABLES and EXTRACTED KEY VALUE PAIRS.
- Medication and past history tables may appear near the END of the OCR text.
- Look for: Current Medication, Current medications, Medication, Medications, Drug Name, Rx, regular medications, medication list, active medication, prescription.
- Medication tables may have columns such as Drug Name, Strength, Dosage, Reason, Last script.
- Extract each medication as drug name + strength + dose/frequency + reason if available.
- Preserve brand/generic combinations if present.
- Return medications as one semicolon-separated line.
- Do NOT return empty medications if a medication table exists.

Allergy extraction:
- Search for Allergy, Allergies, Adverse reactions, ADR, NKDA.
- Allergies may appear immediately above the medication table.
- If it says no known allergies/adverse reactions, return "No known allergies/adverse reactions documented".

Functional extraction:
- Identify walker use, short walking distance, inability to sit, falls concern, ADL limitations, carer/support needs.
- If walking is limited by pain, note that functional capacity is limited by musculoskeletal symptoms.

Investigation extraction:
- Summarise relevant imaging, pathology, ECG, echocardiogram, spirometry, and specialist reports.
- Include modality, body region, date if visible, and key impression.
- Do not copy long radiology reports verbatim.

OCR TEXT:
${text.slice(0, 120000)}
`;

  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}
