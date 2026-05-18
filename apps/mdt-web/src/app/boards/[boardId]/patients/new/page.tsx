"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SOURCES = [
  { id: "GP", label: "GP" },
  { id: "DN", label: "District Nurse" },
  { id: "SW", label: "Social Worker" },
] as const;

// Date of birth must be in the past (no future births) and within a
// plausible human lifespan — scopes the native date picker accordingly.
const DOB_MAX = new Date().toISOString().slice(0, 10);
const DOB_MIN = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  return d.toISOString().slice(0, 10);
})();

export default function NewPatientPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = use(params);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [fullName, setFullName] = useState("");
  const [nhs, setNhs] = useState("");
  const [dob, setDob] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]["id"]>("GP");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const digits = nhs.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("NHS number must be 10 digits.");
      return;
    }

    setPending(true);
    const { data: board, error: boardErr } = await supabase
      .from("mdt_boards")
      .select("practice_id")
      .eq("id", boardId)
      .single();
    if (boardErr || !board) {
      setPending(false);
      setError(boardErr?.message ?? "Board not found.");
      return;
    }

    const { error: insertErr } = await supabase.from("patients").insert({
      practice_id: board.practice_id,
      board_id: boardId,
      nhs_number: digits,
      full_name: fullName,
      dob,
      summary: summary || null,
      source,
    });
    setPending(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    router.replace(`/boards/${boardId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="text-xl font-semibold tracking-tight">Add patient</h1>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Full name</span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">NHS number</span>
          <input
            required
            inputMode="numeric"
            placeholder="10 digits"
            value={nhs}
            onChange={(e) => setNhs(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Date of birth</span>
          <input
            required
            type="date"
            min={DOB_MIN}
            max={DOB_MAX}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Source</span>
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as (typeof SOURCES)[number]["id"])
            }
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Summary (optional)</span>
          <textarea
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
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
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {pending ? "Adding…" : "Add patient"}
        </button>
      </form>
    </div>
  );
}
