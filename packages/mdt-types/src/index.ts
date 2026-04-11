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
