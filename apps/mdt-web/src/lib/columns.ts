// Kanban columns a patient moves through on a board.
// Matches the patients.column_id enum (supabase/migrations/mdt/0003_patients.sql).
export const BOARD_COLUMNS = [
  { id: "TO_DISCUSS", label: "To Discuss" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "FOLLOW_UP", label: "Follow Up" },
  { id: "COMPLETED", label: "Completed" },
] as const;

export type BoardColumnId = (typeof BOARD_COLUMNS)[number]["id"];
