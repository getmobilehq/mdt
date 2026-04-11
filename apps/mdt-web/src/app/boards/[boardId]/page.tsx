import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COLUMNS = [
  { id: "TO_DISCUSS", label: "To Discuss" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "FOLLOW_UP", label: "Follow Up" },
  { id: "COMPLETED", label: "Completed" },
] as const;

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

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-6xl flex flex-col gap-6">
        <header className="flex items-center justify-between">
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
        </header>
        <section className="grid gap-4 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="text-sm font-medium">{col.label}</h2>
              <p className="mt-6 text-xs text-zinc-500">
                Patients appear here (Epic 3).
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
