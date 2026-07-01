import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/checklist";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const fd = await request.formData();
    const get = (k: string) => ((fd.get(k) as string) || "").trim();

    const first_name = get("first_name");
    const last_name = get("last_name");
    const date_of_birth = get("date_of_birth");

    if (!first_name || !date_of_birth) {
      return Response.json({ error: "First name and date of birth are required" }, { status: 400 });
    }

    const full_name = get("full_name") ||
      [get("title"), first_name, get("middle_name"), last_name].filter(Boolean).join(" ");

    const ur_number = get("ur_number") || `UR-${Date.now()}`;

    const { data: created, error } = await supabase
      .from("patients")
      .insert({
        full_name,
        date_of_birth,
        ur_number,
        created_by: user.id,

        // Name
        title: get("title") || null,
        first_name: first_name || null,
        middle_name: get("middle_name") || null,
        last_name: last_name || null,
        preferred_name: get("preferred_name") || null,

        // Identity
        gender: get("gender") || null,
        sex_at_birth: get("sex_at_birth") || null,
        pronouns: get("pronouns") || null,
        sexual_orientation: get("sexual_orientation") || null,
        indigenous_status: get("indigenous_status") || null,

        // Contact
        mobile: get("mobile") || null,
        home_phone: get("home_phone") || null,
        work_phone: get("work_phone") || null,
        email: get("email") || null,
        fax: get("fax") || null,
        preferred_contact: get("preferred_contact") || "mobile",

        // Address
        address_line1: get("address_line1") || null,
        address_suburb: get("address_suburb") || null,
        address_state: get("address_state") || null,
        address_postcode: get("address_postcode") || null,
        address_country: get("address_country") || "Australia",

        // Medicare & insurance
        medicare_number: get("medicare_number") || null,
        medicare_irn: get("medicare_irn") || null,
        medicare_expiry: get("medicare_expiry") || null,
        dva_number: get("dva_number") || null,
        dva_card_colour: get("dva_card_colour") || null,
        health_fund: get("health_fund") || null,
        health_fund_number: get("health_fund_number") || null,
        health_fund_expiry: get("health_fund_expiry") || null,
        concession_type: get("concession_type") || null,
        concession_number: get("concession_number") || null,

        // NOK
        nok_name: get("nok_name") || null,
        nok_relationship: get("nok_relationship") || null,
        nok_phone: get("nok_phone") || null,
        nok_email: get("nok_email") || null,

        // Additional
        occupation: get("occupation") || null,
        country_of_birth: get("country_of_birth") || null,
        language: get("language") || null,
        interpreter_required: get("interpreter_required") === "true",

        // Clinical
        referring_surgeon: get("referring_surgeon") || null,
        planned_surgery: get("planned_surgery") || null,
        surgery_date: get("surgery_date") || null,
        hospital: get("hospital") || null,
      })
      .select("id")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const items = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ patient_id: created!.id, ...item }));
    await supabase.from("checklist_items").insert(items);

    return Response.json({ id: created!.id });
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to create patient" }, { status: 500 });
  }
}
