// Patient "source" = the originator who brought the patient to the MDT board.
// Codes must match the `mdt_patient_source` enum in the database
// (supabase/migrations/mdt/0003_patients.sql + 0013_patient_sources.sql).
export const PATIENT_SOURCES = [
  { id: "GP", label: "GP" },
  { id: "DN", label: "District Nurse" },
  { id: "SW", label: "Social Worker" },
  { id: "SP", label: "Social Prescriber" },
  { id: "CONS", label: "Consultant" },
  { id: "PALL", label: "Palliative Nurse" },
  { id: "CC", label: "Care Coordinator" },
] as const;

export type PatientSourceId = (typeof PATIENT_SOURCES)[number]["id"];

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  PATIENT_SOURCES.map((s) => [s.id, s.label]),
);

/** Human-readable label for a source code; falls back to the raw code. */
export function sourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}
