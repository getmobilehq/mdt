import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/tasks";

type TaskRow = {
  id: string;
  patient_id: string;
  description: string;
  status: TaskStatus;
  deadline: string | null;
  patients: { full_name: string; nhs_number: string } | null;
};

// Personal board columns mirror the task lifecycle (cancelled is hidden).
const COLUMNS = [
  { id: "OPEN", label: TASK_STATUS_LABELS.OPEN },
  { id: "IN_PROGRESS", label: TASK_STATUS_LABELS.IN_PROGRESS },
  { id: "DONE", label: TASK_STATUS_LABELS.DONE },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

function last4(nhs: string | undefined): string {
  const d = (nhs ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `••• ${d.slice(-4)}` : "•••";
}

export default async function MyTasksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: Record<ColumnId, TaskRow[]> = {
    OPEN: [],
    IN_PROGRESS: [],
    DONE: [],
  };

  if (user) {
    // My role(s) across the practices I belong to.
    const { data: memberships } = await supabase
      .from("practice_users")
      .select("role")
      .eq("user_id", user.id);
    const roles = [...new Set((memberships ?? []).map((m) => m.role as string))];

    // Tasks assigned to me directly, or to a role I hold. RLS already limits
    // this to tasks in practices I'm a member of.
    const orFilter = [
      `assigned_to_user_id.eq.${user.id}`,
      roles.length ? `assigned_role.in.(${roles.join(",")})` : "",
    ]
      .filter(Boolean)
      .join(",");

    const { data: tasks } = await supabase
      .from("tasks")
      .select(
        "id, patient_id, description, status, deadline, patients(full_name, nhs_number)",
      )
      .or(orFilter)
      .order("deadline", { ascending: true, nullsFirst: false });

    for (const t of (tasks ?? []) as unknown as TaskRow[]) {
      const patient = Array.isArray(t.patients) ? t.patients[0] : t.patients;
      const row = { ...t, patients: patient ?? null };
      if (row.status === "OPEN" || row.status === "IN_PROGRESS" || row.status === "DONE")
        empty[row.status].push(row);
    }
  }

  const byCol = empty;

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-6xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
          <p className="text-sm text-zinc-500">
            Everything assigned to you or to your role across your practices.
          </p>
        </header>
        <section className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="text-sm font-medium">
                {col.label}{" "}
                <span className="text-zinc-400">({byCol[col.id].length})</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {byCol[col.id].map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/patients/${t.patient_id}`}
                      className="block rounded-xl border border-zinc-200 bg-white p-3 text-sm transition-colors hover:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
                    >
                      <p className="font-medium">{t.description}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {t.patients?.full_name ?? "Unknown patient"} ·{" "}
                        {last4(t.patients?.nhs_number)}
                        {t.deadline ? ` · due ${t.deadline}` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
                {byCol[col.id].length === 0 ? (
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
