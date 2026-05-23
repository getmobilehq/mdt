"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const BOARD_TYPES = [
  { id: "FRAILTY", label: "Frailty" },
  { id: "COMMUNITY", label: "Community" },
  { id: "PSYCHIATRY", label: "Psychiatry" },
  { id: "CHILD_ENQUIRY", label: "Child Enquiry" },
  { id: "CHILD_CONFERENCE", label: "Child Conference" },
  { id: "ADULT_SAFEGUARDING", label: "Adult Safeguarding" },
] as const;

type Practice = { id: string; name: string };

export default function NewBoardPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [practiceId, setPracticeId] = useState("");
  const [boardType, setBoardType] = useState<(typeof BOARD_TYPES)[number]["id"]>("FRAILTY");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    supabase
      .from("practices")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as Practice[];
        setPractices(rows);
        if (rows[0]) setPracticeId(rows[0].id);
      });
  }, [supabase]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { data, error } = await supabase
      .from("mdt_boards")
      .insert({ practice_id: practiceId, board_type: boardType, name })
      .select("id")
      .single();
    setPending(false);
    if (error) {
      // 23505 = unique_violation: one board per (practice, board_type).
      if (error.code === "23505") {
        const label =
          BOARD_TYPES.find((t) => t.id === boardType)?.label ?? "board of this type";
        setError(
          `This practice already has a ${label} board. Each practice can have one board per category.`,
        );
      } else {
        setError(error.message);
      }
      return;
    }
    router.replace(`/boards/${data.id}`);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold tracking-tight">New MDT board</h1>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Practice</span>
          <select
            value={practiceId}
            onChange={(e) => setPracticeId(e.target.value)}
            required
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {practices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Board type</span>
          <select
            value={boardType}
            onChange={(e) =>
              setBoardType(e.target.value as (typeof BOARD_TYPES)[number]["id"])
            }
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {BOARD_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !practiceId}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {pending ? "Creating…" : "Create board"}
        </button>
      </form>
    </div>
  );
}
