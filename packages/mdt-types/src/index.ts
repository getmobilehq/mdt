export type UUID = string;

export type MdtUserRole =
  | "GP"
  | "DN"
  | "ADMIN"
  | "SOCIAL_WORKER"
  | "PCN_ADMIN";

export type BoardType =
  | "FRAILTY"
  | "COMMUNITY"
  | "PSYCHIATRY"
  | "CHILD_ENQUIRY"
  | "CHILD_CONFERENCE"
  | "ADULT_SAFEGUARDING";

export interface Organisation {
  id: UUID;
  name: string;
  created_at: string;
}

export interface Practice {
  id: UUID;
  org_id: UUID;
  name: string;
  address: string | null;
  created_at: string;
}

export interface Profile {
  id: UUID;
  email: string;
  full_name: string;
  default_role: MdtUserRole;
  created_at: string;
}

export interface PracticeMembership {
  user_id: UUID;
  practice_id: UUID;
  role: MdtUserRole;
}

export interface MdtBoard {
  id: UUID;
  practice_id: UUID;
  board_type: BoardType;
  name: string;
  created_by: UUID | null;
  created_at: string;
}

export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  FRAILTY: "Frailty",
  COMMUNITY: "Community",
  PSYCHIATRY: "Psychiatry",
  CHILD_ENQUIRY: "Child Enquiry",
  CHILD_CONFERENCE: "Child Conference",
  ADULT_SAFEGUARDING: "Adult Safeguarding",
};

export type BoardColumn =
  | "TO_DISCUSS"
  | "IN_PROGRESS"
  | "FOLLOW_UP"
  | "COMPLETED";

export const BOARD_COLUMNS: ReadonlyArray<{
  id: BoardColumn;
  label: string;
}> = [
  { id: "TO_DISCUSS", label: "To Discuss" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "FOLLOW_UP", label: "Follow Up" },
  { id: "COMPLETED", label: "Completed" },
];

export type PatientSource = "GP" | "DN" | "SW";

export interface Patient {
  id: UUID;
  practice_id: UUID;
  board_id: UUID;
  nhs_number: string;
  full_name: string;
  dob: string;
  summary: string | null;
  source: PatientSource;
  column_id: BoardColumn;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
}

/** Patient projection safe for logs, lists, and cards — NHS number redacted to last 4. */
export interface PatientCard {
  id: UUID;
  board_id: UUID;
  full_name: string;
  nhs_last4: string;
  source: PatientSource;
  column_id: BoardColumn;
  summary: string | null;
}

export function redactNhsNumber(nhs: string): string {
  const digits = nhs.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "•••";
}

export interface AuditLogEntry {
  id: UUID;
  user_id: UUID | null;
  role: MdtUserRole | null;
  action: string;
  resource_type: string;
  resource_id: UUID | null;
  practice_id: UUID | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
