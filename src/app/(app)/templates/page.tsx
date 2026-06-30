const TEMPLATES = [
  {
    title: "Appointment SMS",
    body: `Hi {{patient_name}}, this is Perioperative Australia. You have a perioperative clinic appointment on {{appointment_date}} at {{time}}. Reply YES to confirm or call us to reschedule.`,
  },
  {
    title: "Bloods chase",
    body: `Hi {{patient_name}}, we still need your blood test results ahead of your perioperative clinic visit on {{appointment_date}}. Please complete these as soon as possible at any pathology collection centre. Call us if you have questions.`,
  },
  {
    title: "Surgeon clearance letter",
    body: `Dear Dr {{surgeon_name}},\n\nRe: {{patient_name}} (DOB {{dob}}, UR {{ur_number}})\n\nThank you for referring the above patient for perioperative assessment ahead of {{planned_surgery}} scheduled for {{surgery_date}} at {{hospital}}.\n\nFollowing review, this patient is considered fit to proceed with the planned procedure. [Insert risk assessment, optimisation steps, and any specific recommendations.]\n\nPlease do not hesitate to contact our clinic with any questions.\n\nKind regards,\nPerioperative Australia`,
  },
  {
    title: "Day 4 phone call script",
    body: `Hi {{patient_name}}, this is {{caller_name}} from Perioperative Australia calling to check in 4 days after your surgery at {{hospital}}.\n\n1. How are you feeling overall?\n2. Are you managing your pain with the prescribed medication?\n3. Any concerns with the surgical site (redness, discharge, swelling)?\n4. Are you eating, drinking, and moving around as expected?\n5. Do you have your follow-up appointment booked?\n6. Any other concerns or questions for the team?\n\nEscalate to the on-call doctor if there are red flag symptoms (fever, uncontrolled pain, wound concerns, breathing difficulty).`,
  },
];

export default function TemplatesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight text-slate-800">Communication templates</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {TEMPLATES.map((t) => (
          <div key={t.title} className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="font-semibold text-brand-teal mb-2">{t.title}</h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{t.body}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
