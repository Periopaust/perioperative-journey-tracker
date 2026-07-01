import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/checklist";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const formData = await request.formData();
    const get = (key: string) => ((formData.get(key) as string) || "").trim();

    const full_name = get("full_name");
    const date_of_birth = get("date_of_birth");

    if (!full_name || !date_of_birth) {
      return Response.json({ error: "Full name and date of birth are required" }, { status: 400 });
    }

    const { data: created, error } = await supabase
      .from("patients")
      .insert({
        full_name,
        date_of_birth,
        ur_number: get("ur_number") || `UR-${Date.now()}`,
        referring_surgeon: get("referring_surgeon") || null,
        planned_surgery: get("planned_surgery") || null,
        surgery_date: get("surgery_date") || null,
        hospital: get("hospital") || null,
        created_by: user.id,
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
