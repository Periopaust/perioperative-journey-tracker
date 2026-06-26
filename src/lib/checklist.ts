export type ChecklistCategory = "clinical" | "admin";

export const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  clinical: "Clinical",
  admin: "Admin",
};

export const CATEGORY_ORDER: ChecklistCategory[] = ["clinical", "admin"];

export const DEFAULT_CHECKLIST_ITEMS: {
  category: ChecklistCategory;
  item_key: string;
  item_label: string;
  sort_order: number;
}[] = [
  // Clinical
  { category: "clinical", item_key: "preop_evaluation_completed", item_label: "Pre-op evaluation completed", sort_order: 1 },
  { category: "clinical", item_key: "bloods_ordered", item_label: "Bloods ordered", sort_order: 2 },
  { category: "clinical", item_key: "bloods_reviewed", item_label: "Bloods results reviewed", sort_order: 3 },
  { category: "clinical", item_key: "clearance_confirmed", item_label: "Clearance to proceed confirmed", sort_order: 4 },
  { category: "clinical", item_key: "clearance_letter_sent", item_label: "Clearance letter sent to surgeon", sort_order: 5 },
  { category: "clinical", item_key: "inhospital_preop_review", item_label: "In-hospital pre-op review done", sort_order: 6 },
  { category: "clinical", item_key: "surgery_completed", item_label: "Surgery completed", sort_order: 7 },
  { category: "clinical", item_key: "postop_medical_review", item_label: "Post-op medical review done", sort_order: 8 },
  { category: "clinical", item_key: "day4_call", item_label: "Day 4 phone call completed", sort_order: 9 },
  { category: "clinical", item_key: "loop_closed", item_label: "Loop closed", sort_order: 10 },

  // Admin
  { category: "admin", item_key: "appointment_booked", item_label: "Appointment date & time booked", sort_order: 1 },
  { category: "admin", item_key: "sms_confirmation_sent", item_label: "Text confirmation sent to patient", sort_order: 2 },
  { category: "admin", item_key: "patient_confirmed", item_label: "Patient confirmed yes/no", sort_order: 3 },
  { category: "admin", item_key: "added_to_diary", item_label: "Added to diary", sort_order: 4 },
  { category: "admin", item_key: "surgery_date_recorded", item_label: "Surgery date recorded", sort_order: 5 },
  { category: "admin", item_key: "jotform_sent", item_label: "Jotform sent to patient", sort_order: 6 },
  { category: "admin", item_key: "jotform_completed", item_label: "Jotform completed by patient", sort_order: 7 },
  { category: "admin", item_key: "preop_letter_sent", item_label: "Pre-op letter sent", sort_order: 8 },
  { category: "admin", item_key: "preop_invoice_sent", item_label: "Pre-op invoice sent", sort_order: 9 },
  { category: "admin", item_key: "seen_by_np", item_label: "Seen by nurse practitioner", sort_order: 10 },
  { category: "admin", item_key: "postop_call_scheduled", item_label: "Post-op call date scheduled", sort_order: 11 },
  { category: "admin", item_key: "postop_call_completed", item_label: "Post-op call completed", sort_order: 12 },
  { category: "admin", item_key: "postop_letter_sent", item_label: "Post-op letter sent", sort_order: 13 },
  { category: "admin", item_key: "postop_invoice_sent", item_label: "Post-op invoice sent", sort_order: 14 },
];
