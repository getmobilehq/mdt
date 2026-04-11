"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Role = "GP" | "DN" | "ADMIN" | "SOCIAL_WORKER" | "PCN_ADMIN";

type Action = {
  id: string;
  patient_id: string;
  description: string;
  owner_role: Role;
  deadline: string | null;
  confirmed: boolean;
  created_by_ai: boolean;
  human_edited: boolean;
};

const ROLES: Role[] = ["GP", "DN", "SOCIAL_WORKER", "ADMIN"];

export function ActionsReview({
  actions,
  patientById,
}: {
  actions: Action[];
  patientById: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function editAction(id: string, patch: Partial<Action>) {
    start(async () => {
      const { error } = await supabase
        .from("actions")
        .update({ ...patch, human_edited: true })
        .eq("id", id);
      if (error) setError(error.message);
      else router.refresh();
    });
  }

  async function confirmAction(a: Action) {
    setError(null);
    start(async () => {
      const { data: task, error: taskErr } = await supabase
        .from("tasks")
        .insert({
          patient_id: a.patient_id,
          description: a.description,
          assigned_role: a.owner_role,
          deadline: a.deadline,
        })
        .select("id")
        .single();
      if (taskErr || !task) {
        setError(taskErr?.message ?? "failed to create task");
        return;
      }
      const { error: actionErr } = await supabase
        .from("actions")
        .update({ confirmed: true, confirmed_task_id: task.id })
        .eq("id", a.id);
      if (actionErr) {
        setError(actionErr.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Extracted actions</h2>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {actions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No AI-extracted actions yet. They appear after the transcription
          worker processes the recording.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actions.map((a) => (
            <li
              key={a.id}
              className={`rounded-xl border p-4 text-sm ${
                a.confirmed
                  ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs text-zinc-500">
                    {patientById[a.patient_id] ?? "Unknown patient"}
                    {a.created_by_ai ? " · AI" : ""}
                    {a.human_edited ? " · edited" : ""}
                    {a.confirmed ? " · confirmed" : ""}
                  </p>
                  <input
                    defaultValue={a.description}
                    disabled={a.confirmed || pending}
                    onBlur={(e) => {
                      if (e.target.value !== a.description) {
                        editAction(a.id, { description: e.target.value });
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm dark:border-zinc-800"
                  />
                  <div className="mt-2 flex gap-2">
                    <select
                      value={a.owner_role}
                      disabled={a.confirmed || pending}
                      onChange={(e) =>
                        editAction(a.id, { owner_role: e.target.value as Role })
                      }
                      className="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-800"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      defaultValue={a.deadline ?? ""}
                      disabled={a.confirmed || pending}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== a.deadline) editAction(a.id, { deadline: v });
                      }}
                      className="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs dark:border-zinc-800"
                    />
                  </div>
                </div>
                {!a.confirmed ? (
                  <button
                    onClick={() => confirmAction(a)}
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
                  >
                    Confirm → task
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
