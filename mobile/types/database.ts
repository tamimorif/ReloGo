/**
 * TypeScript types matching the ReloGo Supabase schema.
 * These map directly to database tables used by the mobile app.
 */

// ──────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────

export type Province =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export type TaskStatus = "LOCKED" | "AVAILABLE" | "COMPLETED";

export type TaskCategory =
  | "DOCUMENTS"
  | "HEALTH"
  | "VEHICLE"
  | "HOUSING"
  | "FINANCE"
  | "UTILITIES"
  | "EDUCATION"
  | "GENERAL";

// ──────────────────────────────────────────────
// Province labels
// ──────────────────────────────────────────────

export const PROVINCE_LABELS: Record<Province, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

export const PROVINCES: Province[] = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

// ──────────────────────────────────────────────
// Database Row Types
// ──────────────────────────────────────────────

export interface UserProfile {
  id: string;
  user_id: string;
  origin_province: Province;
  destination_province: Province;
  move_date: string; // ISO 8601 date
  has_vehicle: boolean;
  has_dependents: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfileInsert {
  origin_province: Province;
  destination_province: Province;
  move_date: string;
  has_vehicle: boolean;
  has_dependents: boolean;
}

export interface GlobalTask {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  official_url: string | null;
  pdf_template_asset: string | null;
  requires_vehicle: boolean;
  requires_dependents: boolean;
  sort_order: number;
  created_at: string;
}

export interface CorridorTaskRule {
  id: string;
  global_task_id: string;
  origin_province: Province | "ANY";
  destination_province: Province;
  deadline_days_offset: number;
  notes: string | null;
  created_at: string;
}

export interface UserTaskProgress {
  id: string;
  user_id: string;
  global_task_id: string;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserTaskProgressInsert {
  global_task_id: string;
  status: TaskStatus;
}

// ──────────────────────────────────────────────
// Computed / Joined Types (for UI)
// ──────────────────────────────────────────────

export interface ChecklistTask {
  /** global_tasks.id */
  taskId: string;
  title: string;
  description: string;
  category: TaskCategory;
  officialUrl: string | null;
  pdfTemplateAsset: string | null;
  deadlineDaysOffset: number;
  corridorNotes: string | null;
  status: TaskStatus;
  completedAt: string | null;
  sortOrder: number;
  /** Computed absolute deadline from move_date + offset */
  deadlineDate: string | null;
}

// ──────────────────────────────────────────────
// PII Keys (stored locally only — never in Supabase)
// ──────────────────────────────────────────────

export type PIIKey =
  | "HEALTH_CARD_NUMBER"
  | "DRIVERS_LICENCE_NUMBER"
  | "STREET_ADDRESS"
  | "FULL_NAME"
  | "DATE_OF_BIRTH";

export const PII_KEYS: PIIKey[] = [
  "HEALTH_CARD_NUMBER",
  "DRIVERS_LICENCE_NUMBER",
  "STREET_ADDRESS",
  "FULL_NAME",
  "DATE_OF_BIRTH",
];
