import { createPatient } from "@/app/actions/patients";

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-slate-800 mb-4">New patient</h1>

      <form action={createPatient} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name" name="full_name" required />
          <Field label="Date of birth" name="date_of_birth" type="date" required />
          <Field label="UR number" name="ur_number" required />
          <Field label="Referring surgeon" name="referring_surgeon" />
          <Field label="Planned surgery" name="planned_surgery" />
          <Field label="Surgery date" name="surgery_date" type="date" />
          <Field label="Hospital" name="hospital" />
        </div>

        <button
          type="submit"
          className="rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90"
        >
          Create patient
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
      />
    </div>
  );
}
