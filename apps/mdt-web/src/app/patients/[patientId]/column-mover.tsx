"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/columns";

/**
 * Moves a patient between kanban columns. This is the only way to reach
 * Follow Up (waiting on something — repeat bloods, awaiting discharge, bring
 * back next week) and Completed.
 */
export function ColumnMover({
  patientId,
  column,
}: {
  patientId: string;
  column: BoardColumnId;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [value, setValue] = useState<BoardColumnId>(column);
  const [pending, start] = useTransition();

  function move(next: BoardColumnId) {
    const prev = value;
    setValue(next);
    start(async () => {
      const { error } = await supabase
        .from("patients")
        .update({ column_id: next })
        .eq("id", patientId);
      if (error) setValue(prev);
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      <span>Status</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => move(e.target.value as BoardColumnId)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
      >
        {BOARD_COLUMNS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
