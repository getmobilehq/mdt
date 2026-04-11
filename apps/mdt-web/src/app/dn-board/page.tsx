import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DnTask = {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_nhs_number: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  deadline: string | null;
};

const COLUMNS = [
  { id: "OPEN", label: "Open" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "DONE", label: "Done" },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

function redactNhs(nhs: string): string {
  const d = nhs.replace(/\D/g, "");
  return d.length >= 4 ? `••• ${d.slice(-4)}` : "•••";
}

export default async function DnBoardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: tasks } = await supabase
    .from("dn_board_tasks")
    .select(
      "id, patient_id, patient_name, patient_nhs_number, description, status, deadline",
    )
    .order("deadline", { ascending: true, nullsFirst: false });

  const rows = (tasks ?? []) as DnTask[];
  const byCol: Record<ColumnId, DnTask[]> = {
    OPEN: [],
    IN_PROGRESS: [],
    DONE: [],
  };
  for (const t of rows) {
    if (t.status === "OPEN" || t.status === "IN_PROGRESS" || t.status === "DONE") {
      byCol[t.status].push(t);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-6xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            District Nurse board
          </h1>
          <p className="text-sm text-zinc-500">
            All tasks assigned to District Nurses across your practices.
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
                        {t.patient_name} · {redactNhs(t.patient_nhs_number)}
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
