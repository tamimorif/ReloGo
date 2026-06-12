/**
 * Supabase Database type definitions for ReloGo.
 *
 * These types mirror the tables used by the admin dashboard.
 * Expand as the schema evolves.
 */

export interface Database {
  public: {
    Tables: {
      official_sources: {
        Row: {
          id: string;
          corridor_rule_id: string;
          agency_name: string;
          official_url: string;
          last_verified: string | null;
        };
        Insert: Omit<OfficialSource, "id">;
        Update: Partial<OfficialSource>;
      };
      rule_change_alerts: {
        Row: {
          id: string;
          source_id: string;
          corridor_rule_id: string;
          old_hash: string;
          new_hash: string;
          status: AlertStatus;
          created_at: string;
        };
        Insert: Omit<RuleChangeAlert, "id">;
        Update: Partial<RuleChangeAlert>;
      };
      corridor_task_rules: {
        Row: {
          id: string;
          corridor_rule_id: string;
          task_name: string;
          days_deadline: number;
          is_mandatory: boolean;
          description: string | null;
        };
        Insert: Omit<CorridorTaskRule, "id">;
        Update: Partial<CorridorTaskRule>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ---------------------------------------------------------------------------
// Convenience type aliases
// ---------------------------------------------------------------------------

export type AlertStatus = "PENDING" | "APPROVED" | "DISMISSED";

export interface OfficialSource {
  id: string;
  corridor_rule_id: string;
  agency_name: string;
  official_url: string;
  last_verified: string | null;
}

export interface RuleChangeAlert {
  id: string;
  source_id: string;
  corridor_rule_id: string;
  old_hash: string;
  new_hash: string;
  status: AlertStatus;
  created_at: string;
}

export interface CorridorTaskRule {
  id: string;
  corridor_rule_id: string;
  task_name: string;
  days_deadline: number;
  is_mandatory: boolean;
  description: string | null;
}

/**
 * An alert row joined with its related official source.
 * Used by the AlertsTable component.
 */
export interface AlertWithSource extends RuleChangeAlert {
  official_sources: Pick<OfficialSource, "agency_name" | "official_url">;
}
