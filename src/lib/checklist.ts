export type JourneyStage =
  | "referral_workup"
  | "clinic_review"
  | "admission_surgery"
  | "discharge_followup";

export const STAGE_LABELS: Record<JourneyStage, string> = {
  referral_workup: "Referral & pre-clinic workup",
  clinic_review: "Perioperative clinic review",
  admission_surgery: "Hospital admission & surgery",
  discharge_followup: "Discharge & follow-up",
};

export const STAGE_ORDER: JourneyStage[] = [
  "referral_workup",
  "clinic_review",
  "admission_surgery",
  "discharge_followup",
];

export const DEFAULT_CHECKLIST_ITEMS: {
  stage: JourneyStage;
  item_key: string;
  item_label: string;
  sort_order: number;
}[] = [
  // Referral & pre-clinic workup
  { stage: "referral_workup", item_key: "referral_received", item_label: "Referral received", sort_order: 1 },
  { stage: "referral_workup", item_key: "bloods_ordered", item_label: "Pre-clinic bloods ordered", sort_order: 2 },
  { stage: "referral_workup", item_key: "bloods_received", item_label: "Bloods results received", sort_order: 3 },
  { stage: "referral_workup", item_key: "clinic_appointment_booked", item_label: "Perioperative clinic appointment booked", sort_order: 4 },

  // Perioperative clinic review
  { stage: "clinic_review", item_key: "clinic_review_completed", item_label: "Clinic review completed", sort_order: 1 },
  { stage: "clinic_review", item_key: "risk_assessment_documented", item_label: "Risk assessment documented", sort_order: 2 },
  { stage: "clinic_review", item_key: "surgeon_clearance_sent", item_label: "Surgeon clearance letter sent", sort_order: 3 },
  { stage: "clinic_review", item_key: "optimisation_plan", item_label: "Optimisation plan in place", sort_order: 4 },

  // Hospital admission & surgery
  { stage: "admission_surgery", item_key: "admission_confirmed", item_label: "Admission confirmed", sort_order: 1 },
  { stage: "admission_surgery", item_key: "surgery_completed", item_label: "Surgery completed", sort_order: 2 },
  { stage: "admission_surgery", item_key: "postop_review", item_label: "Post-operative review completed", sort_order: 3 },

  // Discharge & follow-up
  { stage: "discharge_followup", item_key: "discharge_summary_sent", item_label: "Discharge summary sent", sort_order: 1 },
  { stage: "discharge_followup", item_key: "day4_call", item_label: "Day 4 phone call completed", sort_order: 2 },
  { stage: "discharge_followup", item_key: "followup_booked", item_label: "Follow-up appointment booked", sort_order: 3 },
];
