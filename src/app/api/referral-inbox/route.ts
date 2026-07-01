/**
 * Referral inbox webhook — receives inbound emails forwarded by an email service
 * and auto-creates patients from the referral content.
 *
 * Compatible with:
 *  - SendGrid Inbound Parse  (POST multipart/form-data: from, subject, text, html, attachments)
 *  - Postmark Inbound        (POST application/json: From, Subject, TextBody, HtmlBody, Attachments)
 *
 * Set REFERRAL_INBOX_SECRET in env vars and pass it as ?secret=... in the webhook URL
 * to prevent unauthorised submissions.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { extractTextFromUploads } from "@/lib/periop-extract";
import OpenAI from "openai";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/checklist";

const SYSTEM_PROMPT = `You are a medical records assistant. Extract patient and referral details from the provided email or referral letter text.

Return a JSON object with these fields (use null if not found):
{
  "full_name": "patient full name (no title)",
  "date_of_birth": "YYYY-MM-DD",
  "ur_number": "UR or patient number if present",
  "title": "Mr/Mrs/Ms/Miss/Dr/Prof etc",
  "referring_surgeon": "referring doctor full name e.g. Dr John Smith",
  "referring_practice": "referring practice or clinic",
  "referring_address": "referring doctor address",
  "planned_surgery": "planned procedure or surgery",
  "surgery_date": "YYYY-MM-DD or null",
  "hospital": "hospital name",
  "medicare_number": "Medicare number",
  "medicare_irn": "IRN digit",
  "medicare_expiry": "MM/YY format",
  "dva_number": "DVA number if present",
  "health_fund": "private health fund name",
  "health_fund_number": "health fund membership number",
  "phone": "patient mobile or primary phone",
  "home_phone": "patient home phone if separate",
  "email": "patient email address",
  "address": "patient street address",
  "suburb": "patient suburb",
  "state": "patient state (e.g. NSW, VIC)",
  "postcode": "patient postcode",
  "occupation": "patient occupation",
  "country_of_birth": "country of birth",
  "nok_name": "next of kin name",
  "nok_relationship": "next of kin relationship",
  "nok_phone": "next of kin phone",
  "reason_for_referral": "brief reason for referral"
}

IMPORTANT:
- full_name and date_of_birth are the most critical fields — if missing, extraction cannot proceed
- Convert date formats to YYYY-MM-DD
- Remove titles from full_name but capture in title field
- Return ONLY valid JSON, no explanation`;

export async function POST(request: Request) {
  // Validate webhook secret
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.REFERRAL_INBOX_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let emailText = "";
    const attachmentFiles: File[] = [];

    if (contentType.includes("application/json")) {
      // Postmark format
      const body = await request.json();
      emailText = [
        body.Subject ? `Subject: ${body.Subject}` : "",
        body.From ? `From: ${body.From}` : "",
        body.TextBody || body.HtmlBody?.replace(/<[^>]+>/g, " ") || "",
      ].filter(Boolean).join("\n\n");

      // Postmark attachments come as base64
      if (Array.isArray(body.Attachments)) {
        for (const att of body.Attachments) {
          if (!att.ContentType?.includes("pdf") && !att.ContentType?.includes("image")) continue;
          const buf = Buffer.from(att.Content, "base64");
          attachmentFiles.push(new File([buf], att.Name, { type: att.ContentType }));
        }
      }
    } else {
      // SendGrid multipart format
      const fd = await request.formData();
      const from    = (fd.get("from")    as string) ?? "";
      const subject = (fd.get("subject") as string) ?? "";
      const text    = (fd.get("text")    as string) ?? "";
      const html    = (fd.get("html")    as string) ?? "";
      emailText = [
        subject ? `Subject: ${subject}` : "",
        from    ? `From: ${from}` : "",
        text || html.replace(/<[^>]+>/g, " "),
      ].filter(Boolean).join("\n\n");

      // SendGrid sends attachments as numbered file fields
      let i = 1;
      while (fd.has(`attachment${i}`)) {
        const f = fd.get(`attachment${i}`) as File | null;
        if (f && (f.type.includes("pdf") || f.type.includes("image"))) {
          attachmentFiles.push(f);
        }
        i++;
      }
    }

    if (!emailText.trim() && attachmentFiles.length === 0) {
      return Response.json({ error: "Empty email body" }, { status: 400 });
    }

    // Extract text from any attached documents
    const { extractedText } = await extractTextFromUploads({
      files: attachmentFiles,
      pastedText: emailText,
    });

    if (!extractedText.trim()) {
      return Response.json({ error: "No readable content in referral" }, { status: 400 });
    }

    // AI extraction
    const openai = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`,
    });

    const aiResponse = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract patient details from this referral email:\n\n${extractedText.slice(0, 8000)}` },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = aiResponse.choices[0]?.message?.content ?? "{}";
    const d = JSON.parse(raw);

    // Require minimum identifiers: name + DOB
    const fullName = d.full_name?.trim();
    const dob      = d.date_of_birth?.trim();

    if (!fullName || !dob) {
      // Save to referral_inbox_queue for manual review
      const supabase = createAdminClient();
      await supabase.from("referral_inbox_queue").insert({
        raw_text: extractedText.slice(0, 5000),
        extracted: d,
        status: "needs_review",
        reason: "Missing name or DOB",
      });
      return Response.json({ status: "queued", reason: "Missing required patient identifiers" }, { status: 202 });
    }

    // Check for duplicate (same name + DOB)
    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("patients")
      .select("id, full_name")
      .ilike("full_name", fullName)
      .eq("date_of_birth", dob)
      .maybeSingle();

    if (existing) {
      // Patient already exists — queue referral as note instead of duplicating
      await supabase.from("referral_inbox_queue").insert({
        raw_text: extractedText.slice(0, 5000),
        extracted: d,
        status: "duplicate",
        reason: `Matched existing patient ${existing.id}`,
        matched_patient_id: existing.id,
      });
      return Response.json({ status: "duplicate", patient_id: existing.id });
    }

    // Build name parts
    const nameParts = fullName.split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName  = nameParts.slice(1).join(" ");

    // Create patient
    const { data: created, error: insertError } = await supabase
      .from("patients")
      .insert({
        full_name: fullName,
        date_of_birth: dob,
        ur_number: d.ur_number || `UR-${Date.now()}`,
        title: d.title || null,
        first_name: firstName || null,
        last_name: lastName || null,
        mobile: d.phone || null,
        home_phone: d.home_phone || null,
        email: d.email || null,
        address_line1: d.address || null,
        address_suburb: d.suburb || null,
        address_state: d.state || null,
        address_postcode: d.postcode || null,
        medicare_number: d.medicare_number || null,
        medicare_irn: d.medicare_irn || null,
        medicare_expiry: d.medicare_expiry || null,
        dva_number: d.dva_number || null,
        health_fund: d.health_fund || null,
        health_fund_number: d.health_fund_number || null,
        occupation: d.occupation || null,
        country_of_birth: d.country_of_birth || null,
        nok_name: d.nok_name || null,
        nok_relationship: d.nok_relationship || null,
        nok_phone: d.nok_phone || null,
        referring_surgeon: d.referring_surgeon || null,
        planned_surgery: d.planned_surgery || d.reason_for_referral || null,
        surgery_date: d.surgery_date || null,
        hospital: d.hospital || null,
        // Source tracking
        intake_source: "email_referral",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Patient insert error:", insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Default checklist
    const items = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ patient_id: created!.id, ...item }));
    await supabase.from("checklist_items").insert(items);

    // Log to inbox queue as processed
    await supabase.from("referral_inbox_queue").insert({
      raw_text: extractedText.slice(0, 5000),
      extracted: d,
      status: "created",
      matched_patient_id: created!.id,
    });

    console.log(`[referral-inbox] Created patient ${created!.id} (${fullName}) from email referral`);
    return Response.json({ status: "created", patient_id: created!.id });
  } catch (err: any) {
    console.error("[referral-inbox] Error:", err);
    return Response.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
