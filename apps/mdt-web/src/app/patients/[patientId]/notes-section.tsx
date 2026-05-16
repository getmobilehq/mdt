"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Note = {
  id: string;
  content: string;
  is_private: boolean;
  created_by: string;
  created_at: string;
};

export function NotesSection({ patientId }: { patientId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [notes, setNotes] = useState<Note[]>([]);
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("notes")
      .select("id, content, is_private, created_by, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    setNotes((data ?? []) as Note[]);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPending(false);
      setError("You must be signed in to add a note.");
      return;
    }
    // notes.created_by is NOT NULL and RLS requires created_by = auth.uid().
    const { error } = await supabase.from("notes").insert({
      patient_id: patientId,
      content,
      is_private: isPrivate,
      created_by: user.id,
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setContent("");
    setIsPrivate(false);
    await load();
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Notes</h2>
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <textarea
          required
          rows={3}
          placeholder="Add a note…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span>Private (only visible to me)</span>
          </label>
          <button
            type="submit"
            disabled={pending || !content}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          >
            {pending ? "Saving…" : "Save note"}
          </button>
        </div>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No notes yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-3 text-sm ${
                n.is_private
                  ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{new Date(n.created_at).toLocaleString()}</span>
                {n.is_private ? (
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Private{me === n.created_by ? " · you" : ""}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{n.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
