/**
 * TypeScript types matching the ReloGo Supabase schema
 * (supabase/migrations/001_init.sql + 002_hardening_and_user_deletion.sql).
 *
 * ⚠️ KEEP IN SYNC with admin/src/types/database.ts — the `Database` interface
 * must be identical in both files until types are centralized (#C3 in the
 * master plan). Regenerate/update BOTH whenever a migration changes the schema.
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

/** corridor_task_rules province columns also accept the wildcard. */
export type ProvinceOrAny = Province | "ANY";

export type TaskStatus = "LOCKED" | "AVAILABLE" | "COMPLETED";

export type AlertStatus = "PENDING" | "APPROVED" | "DISMISSED";

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
// Admin RPC payload shapes (admin_list_users / admin_get_user_detail).
// Keep identical in mobile/types/database.ts and admin/src/types/database.ts.
// ──────────────────────────────────────────────

export interface AdminUserTask {
  task_rule_id: string;
  task_key: string;
  title: string;
  days_deadline: number | null;
  is_mandatory: boolean;
  status: TaskStatus;
  status_updated_at: string | null;
  official_url: string | null;
}

export interface AdminUserListRow {
  user_id: string;
  email: string | null;
  is_anonymous: boolean;
  joined_at: string | null;
  last_sign_in_at: string | null;
  origin_prov: Province | null;
  dest_prov: Province | null;
  move_date: string | null;
  has_vehicle: boolean;
  has_dependents: boolean;
  profile_updated_at: string;
  tasks_completed: number;
  tasks_total: number;
}

export interface AdminUserDetail {
  user_id: string;
  email: string | null;
  is_anonymous: boolean;
  joined_at: string | null;
  last_sign_in_at: string | null;
  origin_prov: Province | null;
  dest_prov: Province | null;
  move_date: string | null;
  has_vehicle: boolean;
  has_dependents: boolean;
  profile_created_at: string;
  profile_updated_at: string;
  tasks: AdminUserTask[];
}

// ──────────────────────────────────────────────
// Supabase Database interface
//
// ⚠️ INVARIANT: the `export interface Database { ... }` block below must be
// byte-identical between mobile/types/database.ts and
// admin/src/types/database.ts (same tables, same order, same whitespace),
// until types are centralized (#C3). Helper types outside the block may
// differ per app. Check with: scripts/check-database-types-sync.sh
// (enforced by the "types-sync" job in .github/workflows/ci.yml).
// ──────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      global_tasks: {
        Row: {
          id: string;
          task_key: string;
          title_en: string;
          base_description_en: string;
          requires_vehicle: boolean;
          requires_dependents: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_key: string;
          title_en: string;
          base_description_en?: string;
          requires_vehicle?: boolean;
          requires_dependents?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["global_tasks"]["Insert"]>;
        Relationships: [];
      };
      corridor_task_rules: {
        Row: {
          id: string;
          task_id: string;
          origin_province: ProvinceOrAny;
          dest_province: ProvinceOrAny;
          days_deadline: number | null;
          is_mandatory: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          origin_province?: ProvinceOrAny;
          dest_province?: ProvinceOrAny;
          days_deadline?: number | null;
          is_mandatory?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["corridor_task_rules"]["Insert"]
        >;
        Relationships: [];
      };
      official_sources: {
        Row: {
          id: string;
          corridor_rule_id: string;
          agency_name: string;
          official_url: string;
          last_verified: string | null;
          last_content_hash: string | null;
          last_content_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          corridor_rule_id: string;
          agency_name: string;
          official_url: string;
          last_verified?: string | null;
          last_content_hash?: string | null;
          last_content_text?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["official_sources"]["Insert"]
        >;
        Relationships: [];
      };
      rule_change_alerts: {
        Row: {
          id: string;
          official_source_id: string;
          old_hash: string;
          new_hash: string;
          diff_summary: string | null;
          status: AlertStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          official_source_id: string;
          old_hash: string;
          new_hash: string;
          diff_summary?: string | null;
          status?: AlertStatus;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["rule_change_alerts"]["Insert"]
        >;
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          move_date: string | null;
          origin_prov: Province | null;
          dest_prov: Province | null;
          has_vehicle: boolean;
          has_dependents: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          move_date?: string | null;
          origin_prov?: Province | null;
          dest_prov?: Province | null;
          has_vehicle?: boolean;
          has_dependents?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["user_profiles"]["Insert"]
        >;
        Relationships: [];
      };
      user_task_progress: {
        Row: {
          user_id: string;
          task_rule_id: string;
          status: TaskStatus;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          task_rule_id: string;
          status?: TaskStatus;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["user_task_progress"]["Insert"]
        >;
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          origin_province: Province | null;
          dest_province: Province | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          origin_province?: Province | null;
          dest_province?: Province | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["waitlist"]["Insert"]>;
        Relationships: [];
      };
      admin_users: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      support_threads: {
        Row: {
          id: string;
          user_id: string;
          subject: string | null;
          status: "AI" | "AWAITING_HUMAN" | "HUMAN" | "RESOLVED";
          human_takeover_at: string | null;
          created_at: string;
          updated_at: string;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          subject?: string | null;
          status?: "AI" | "AWAITING_HUMAN" | "HUMAN" | "RESOLVED";
          human_takeover_at?: string | null;
          created_at?: string;
          updated_at?: string;
          last_message_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["support_threads"]["Insert"]
        >;
        Relationships: [];
      };
      support_messages: {
        Row: {
          id: string;
          thread_id: string;
          sender: "user" | "ai" | "admin";
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender: "user" | "ai" | "admin";
          body: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["support_messages"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_get_user_detail: {
        Args: { p_user_id: string };
        Returns: AdminUserDetail;
      };
      admin_list_users: {
        Args: Record<string, never>;
        Returns: AdminUserListRow[];
      };
      approve_rule_change: {
        Args: {
          p_alert_id: string;
          p_days_deadline: number | null;
          p_is_mandatory: boolean;
        };
        Returns: undefined;
      };
      delete_current_user: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      dismiss_rule_change: {
        Args: { p_alert_id: string };
        Returns: undefined;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      join_waitlist: {
        Args: {
          p_email: string;
          p_origin_province?: string | null;
          p_dest_province?: string | null;
        };
        Returns: undefined;
      };
      persist_official_source_scrape: {
        Args: {
          p_official_source_id: string;
          p_expected_hash: string | null;
          p_new_hash: string;
          p_content_text: string;
          p_diff_summary?: string | null;
        };
        Returns: Array<{
          classification: "BASELINE" | "UNCHANGED" | "CHANGED" | "STALE";
          alert_id: string | null;
          current_hash: string | null;
        }>;
      };
      persist_support_ai_reply: {
        Args: {
          p_thread_id: string;
          p_expected_user_message_id: string;
          p_reply_body: string;
          p_escalate: boolean;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}

// ──────────────────────────────────────────────
// Convenience row aliases
// ──────────────────────────────────────────────

export type GlobalTask =
  Database["public"]["Tables"]["global_tasks"]["Row"];
export type CorridorTaskRule =
  Database["public"]["Tables"]["corridor_task_rules"]["Row"];
export type OfficialSource =
  Database["public"]["Tables"]["official_sources"]["Row"];
export type RuleChangeAlert =
  Database["public"]["Tables"]["rule_change_alerts"]["Row"];
export type UserProfile =
  Database["public"]["Tables"]["user_profiles"]["Row"];
export type UserProfileInsert =
  Database["public"]["Tables"]["user_profiles"]["Insert"];
export type UserTaskProgress =
  Database["public"]["Tables"]["user_task_progress"]["Row"];
export type UserTaskProgressInsert =
  Database["public"]["Tables"]["user_task_progress"]["Insert"];
export type SupportThread =
  Database["public"]["Tables"]["support_threads"]["Row"];
export type SupportThreadInsert =
  Database["public"]["Tables"]["support_threads"]["Insert"];
export type SupportMessage =
  Database["public"]["Tables"]["support_messages"]["Row"];
export type SupportMessageInsert =
  Database["public"]["Tables"]["support_messages"]["Insert"];
/** Thread lifecycle: AI answering → escalated → human handling → closed. */
export type SupportThreadStatus =
  | "AI"
  | "AWAITING_HUMAN"
  | "HUMAN"
  | "RESOLVED";
/** Who authored a chat message. */
export type SupportMessageSender = "user" | "ai" | "admin";

// ──────────────────────────────────────────────
// Computed / Joined Types (for UI)
// ──────────────────────────────────────────────

/** A corridor rule joined with its global task, as consumed by the checklist. */
export interface ChecklistTask {
  /** corridor_task_rules.id — the key used in user_task_progress */
  taskRuleId: string;
  /** global_tasks.id */
  taskId: string;
  taskKey: string;
  title: string;
  description: string;
  requiresVehicle: boolean;
  requiresDependents: boolean;
  daysDeadline: number | null;
  isMandatory: boolean;
  status: TaskStatus;
  /** Computed absolute deadline: move_date + days_deadline (ISO date) */
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
