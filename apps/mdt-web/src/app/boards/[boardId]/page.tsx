import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sourceLabel } from "@/lib/sources";
import {
  roleLabel,
  TASK_STATUS_LABELS,
  TASK_STATUS_STYLES,
  type TaskStatus,
} from "@/lib/tasks";

const COLUMNS = [
  { id: "TO_DISCUSS", label: "To Discuss" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "FOLLOW_UP", label: "Follow Up" },
  { id: "COMPLETED", label: "Completed" },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

type PatientRow = {
  id: string;
  full_name: string;
  nhs_number: string;
  source: string;
  column_id: ColumnId;
  summary: string | null;
};

type TaskRow = {
  id: string;
  patient_id: string;
  assigned_role: string;
  assigned_to_user_id: string | null;
  status: TaskStatus;
};

function redactNhs(nhs: string): string {
  const d = nhs.replace(/\D/g, "");
  return d.length >= 4 ? `••• ••• ${d.slice(-4)}` : "•••";
}

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: board } = await supabase
    .from("mdt_boards")
    .select("id, name, board_type, practice_id")
    .eq("id", boardId)
    .maybeSingle();

  if (!board) notFound();

  const { data: patients } = await supabase
    .from("patients")
    .select("id, full_name, nhs_number, source, column_id, summary")
    .eq("board_id", boardId)
    .order("created_at");

  const rows = (patients ?? []) as PatientRow[];
  const byColumn: Record<ColumnId, PatientRow[]> = {
    TO_DISCUSS: [],
    IN_PROGRESS: [],
    FOLLOW_UP: [],
    COMPLETED: [],
  };
  for (const p of rows) byColumn[p.column_id].push(p);

  // Surface task status + assignee on each card without opening the patient.
  const patientIds = rows.map((p) => p.id);
  const tasksByPatient: Record<string, TaskRow[]> = {};
  const assigneeNames: Record<string, string> = {};
  if (patientIds.length > 0) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, patient_id, assigned_role, assigned_to_user_id, status")
      .in("patient_id", patientIds)
      .neq("status", "CANCELLED")
      .order("created_at");

    const taskRows = (tasks ?? []) as TaskRow[];
    for (const t of taskRows) (tasksByPatient[t.patient_id] ??= []).push(t);

    const userIds = [
      ...new Set(taskRows.map((t) => t.assigned_to_user_id).filter(Boolean)),
    ] as string[];
    if (userIds.length > 0) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const person of people ?? [])
        assigneeNames[person.id as string] = person.full_name as string;
    }
  }

  function assigneeLabel(t: TaskRow): string {
    if (t.assigned_to_user_id && assigneeNames[t.assigned_to_user_id])
      return assigneeNames[t.assigned_to_user_id];
    return roleLabel(t.assigned_role);
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-6xl flex flex-col gap-6">
        <header className="flex items-end justify-between">
          <div>
            <Link
              href="/boards"
              className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              ← All boards
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {board.name}
            </h1>
            <p className="text-sm text-zinc-500">{board.board_type}</p>
          </div>
          <div className="flex gap-2">
            <form action={`/boards/${boardId}/meeting/start`} method="post">
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Start meeting
              </button>
            </form>
            <Link
              href={`/boards/${boardId}/patients/new`}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
            >
              Add patient
            </Link>
          </div>
        </header>
        <section className="grid gap-4 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="text-sm font-medium">
                {col.label}{" "}
                <span className="text-zinc-400">({byColumn[col.id].length})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {byColumn[col.id].map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/patients/${p.id}`}
                      className="block rounded-xl border border-zinc-200 bg-white p-3 text-sm transition-colors hover:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
                    >
                      <p className="font-medium">{p.full_name}</p>
                      <p className="text-xs text-zinc-500">
                        {redactNhs(p.nhs_number)} · {sourceLabel(p.source)}
                      </p>
                      {p.summary ? (
                        <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {p.summary}
                        </p>
                      ) : null}
                      {(tasksByPatient[p.id]?.length ?? 0) > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1">
                          {tasksByPatient[p.id].map((t) => (
                            <li
                              key={t.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                                {assigneeLabel(t)}
                              </span>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TASK_STATUS_STYLES[t.status]}`}
                              >
                                {TASK_STATUS_LABELS[t.status]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Link>
                  </li>
                ))}
                {byColumn[col.id].length === 0 ? (
                  <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
                    Empty
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
