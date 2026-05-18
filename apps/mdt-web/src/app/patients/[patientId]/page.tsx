import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddTaskForm } from "./add-task-form";
import { NotesSection } from "./notes-section";
import { TaskRow } from "./task-row";

type TaskRowData = {
  id: string;
  description: string;
  assigned_role: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  deadline: string | null;
};

function redactNhs(nhs: string): string {
  const d = nhs.replace(/\D/g, "");
  return d.length >= 4 ? `••• ••• ${d.slice(-4)}` : "•••";
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, nhs_number, dob, source, summary, board_id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient) notFound();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, description, assigned_role, status, deadline")
    .eq("patient_id", patientId)
    .order("created_at");

  const rows = (tasks ?? []) as TaskRowData[];

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-3xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {patient.full_name}
          </h1>
          <p className="text-sm text-zinc-500">
            {redactNhs(patient.nhs_number)} · DOB {patient.dob} · {patient.source}
          </p>
          {patient.summary ? (
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
              {patient.summary}
            </p>
          ) : null}
        </header>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Tasks</h2>
          </div>
          <AddTaskForm patientId={patientId} />
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No tasks yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </section>

        <NotesSection patientId={patientId} />
      </main>
    </div>
  );
}
