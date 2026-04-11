"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Entry = {
  position: number;
  id: string;
  full_name: string;
  nhs_last4: string;
  summary: string | null;
  source: "GP" | "DN" | "SW";
};

export function MeetingRunner({
  sessionId,
  boardId,
  entries,
}: {
  sessionId: string;
  boardId: string;
  entries: Entry[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = entries[index];

  async function saveAndAdvance() {
    if (!current) return;
    setError(null);
    const content = note.trim();
    start(async () => {
      if (content) {
        const { error } = await supabase.from("notes").insert({
          patient_id: current.id,
          content,
          is_private: false,
        });
        if (error) {
          setError(error.message);
          return;
        }
      }
      await supabase
        .from("session_patients")
        .update({ discussed_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .eq("patient_id", current.id);

      setNote("");
      if (index + 1 < entries.length) {
        setIndex(index + 1);
      }
    });
  }

  async function endMeeting() {
    start(async () => {
      const { error } = await supabase
        .from("sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) {
        setError(error.message);
        return;
      }
      router.replace(`/boards/${boardId}`);
      router.refresh();
    });
  }

  if (!current) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm dark:border-zinc-800 dark:bg-zinc-950">
        All patients discussed.
        <button
          onClick={endMeeting}
          disabled={pending}
          className="mt-4 block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          End meeting
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Patient {index + 1} of {entries.length}
        </span>
        <button
          onClick={endMeeting}
          disabled={pending}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          End meeting
        </button>
      </div>
      <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">{current.full_name}</h2>
        <p className="text-xs text-zinc-500">
          {current.nhs_last4} · {current.source}
        </p>
        {current.summary ? (
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            {current.summary}
          </p>
        ) : null}
      </article>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Live notes (shared)</span>
        <textarea
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Decisions and actions for this patient…"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0 || pending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Back
        </button>
        <button
          onClick={saveAndAdvance}
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {index + 1 < entries.length ? "Save & next" : "Save & finish"}
        </button>
      </div>
    </div>
  );
}
