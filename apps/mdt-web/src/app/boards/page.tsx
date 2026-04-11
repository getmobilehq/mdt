import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BoardRow = {
  id: string;
  practice_id: string;
  board_type: string;
  name: string;
};

const BOARD_TYPE_LABELS: Record<string, string> = {
  FRAILTY: "Frailty",
  COMMUNITY: "Community",
  PSYCHIATRY: "Psychiatry",
  CHILD_ENQUIRY: "Child Enquiry",
  CHILD_CONFERENCE: "Child Conference",
  ADULT_SAFEGUARDING: "Adult Safeguarding",
};

export default async function BoardsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: boards } = await supabase
    .from("mdt_boards")
    .select("id, practice_id, board_type, name")
    .order("board_type");

  const rows = (boards ?? []) as BoardRow[];

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <main className="mx-auto w-full max-w-4xl flex flex-col gap-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MDT boards</h1>
            <p className="text-sm text-zinc-500">
              Select a board to review patients and actions.
            </p>
          </div>
          <Link
            href="/boards/new"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            New board
          </Link>
        </header>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No boards yet. Create one to get started.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/boards/${b.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-white"
                >
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    {BOARD_TYPE_LABELS[b.board_type] ?? b.board_type}
                  </p>
                  <p className="mt-1 text-base font-medium">{b.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
