import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  source: "GP" | "DN" | "SW";
  column_id: ColumnId;
  summary: string | null;
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
          <Link
            href={`/boards/${boardId}/patients/new`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Add patient
          </Link>
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
                        {redactNhs(p.nhs_number)} · {p.source}
                      </p>
                      {p.summary ? (
                        <p className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {p.summary}
                        </p>
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
