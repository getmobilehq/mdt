"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ROLES = [
  { id: "GP", label: "GP" },
  { id: "DN", label: "District Nurse" },
  { id: "SOCIAL_WORKER", label: "Social Worker" },
  { id: "ADMIN", label: "Admin" },
] as const;

export function AddTaskForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [description, setDescription] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("GP");
  const [deadline, setDeadline] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.from("tasks").insert({
      patient_id: patientId,
      description,
      assigned_role: role,
      deadline: deadline || null,
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDescription("");
    setDeadline("");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <input
        required
        placeholder="Task description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex gap-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as (typeof ROLES)[number]["id"])}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending || !description}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
