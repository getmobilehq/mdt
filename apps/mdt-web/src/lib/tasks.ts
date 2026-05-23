// Shared task vocabulary so the board cards and the patient task list render
// statuses and assignee roles identically.
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  OPEN: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  CANCELLED: "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-900",
};

// mdt_user_role enum (supabase/migrations/mdt/0001_foundation.sql).
const ROLE_LABELS: Record<string, string> = {
  GP: "GP",
  DN: "District Nurse",
  ADMIN: "Admin",
  SOCIAL_WORKER: "Social Worker",
  PCN_ADMIN: "PCN Admin",
};

/** Human-readable label for an assigned role; falls back to the raw code. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
