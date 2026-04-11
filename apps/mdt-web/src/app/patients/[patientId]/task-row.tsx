"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Task = {
  id: string;
  description: string;
  assigned_role: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  deadline: string | null;
};

const STATUS_LABELS: Record<Task["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<Task["status"], string> = {
  OPEN: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  CANCELLED: "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-900",
};

export function TaskRow({ task }: { task: Task }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(task.status);

  function update(next: Task["status"]) {
    const prev = status;
    setStatus(next);
    start(async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: next })
        .eq("id", task.id);
      if (error) {
        setStatus(prev);
      }
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex-1">
        <p className="font-medium">{task.description}</p>
        <p className="text-xs text-zinc-500">
          {task.assigned_role}
          {task.deadline ? ` · due ${task.deadline}` : ""}
        </p>
      </div>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => update(e.target.value as Task["status"])}
        className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
      >
        {(Object.keys(STATUS_LABELS) as Task["status"][]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </li>
  );
}
