import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import type {
  AlertWithSource,
  CorridorTaskRuleWithTask,
} from "../types/database";

interface EditRuleModalProps {
  alert: AlertWithSource;
  onClose: (saved: boolean) => void;
}

export function EditRuleModal({ alert, onClose }: EditRuleModalProps) {
  const [rule, setRule] = useState<CorridorTaskRuleWithTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields. days_deadline is kept as a string so the empty input
  // can faithfully represent NULL ("no fixed deadline") — coercing to a
  // number would silently rewrite NULL rules to 0 days on save.
  const [daysDeadline, setDaysDeadline] = useState<string>("");
  const [isMandatory, setIsMandatory] = useState<boolean>(false);

  // The corridor rule is reached through the alert's official source.
  const corridorRuleId = alert.official_sources.corridor_rule_id;

  // ── Fetch the related corridor_task_rules row ─────────────────────────
  useEffect(() => {
    const fetchRule = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchErr } = await supabase
        .from("corridor_task_rules")
        .select("*, global_tasks(title_en, base_description_en)")
        .eq("id", corridorRuleId)
        .single();

      if (fetchErr) {
        setError(fetchErr.message);
      } else if (data) {
        const typed = data as unknown as CorridorTaskRuleWithTask;
        setRule(typed);
        setDaysDeadline(
          typed.days_deadline === null ? "" : String(typed.days_deadline),
        );
        setIsMandatory(typed.is_mandatory);
      }
      setLoading(false);
    };

    fetchRule();
  }, [corridorRuleId]);

  // ── Save changes ──────────────────────────────────────────────────────
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!rule) return;

    setSaving(true);
    setError(null);

    // Atomic server-side: updates the rule AND approves the alert in one
    // transaction (empty deadline input = no fixed deadline).
    const { error: rpcErr } = await supabase.rpc("approve_rule_change", {
      p_alert_id: alert.id,
      p_days_deadline:
        daysDeadline.trim() === "" ? null : Number(daysDeadline),
      p_is_mandatory: isMandatory,
    });

    if (rpcErr) {
      setError(rpcErr.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose(true);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onClose(false)}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Edit Rule</h3>
          <button
            onClick={() => onClose(false)}
            className="text-slate-400 transition hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : error && !rule ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : rule ? (
            <form id="edit-rule-form" onSubmit={handleSave} className="space-y-5">
              {/* Read-only context */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Task Name
                </p>
                <p className="mt-1 text-sm font-medium text-white">
                  {rule.global_tasks.title_en}
                </p>
              </div>

              {rule.global_tasks.base_description_en && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Description
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {rule.global_tasks.base_description_en}
                  </p>
                </div>
              )}

              {/* Editable: days_deadline */}
              <div>
                <label
                  htmlFor="days-deadline"
                  className="mb-1 block text-sm font-medium text-slate-300"
                >
                  Days Deadline
                </label>
                <input
                  id="days-deadline"
                  type="number"
                  min={0}
                  value={daysDeadline}
                  onChange={(e) => setDaysDeadline(e.target.value)}
                  placeholder="No fixed deadline"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Leave empty for no fixed deadline.
                </p>
              </div>

              {/* Editable: is_mandatory */}
              <div className="flex items-center gap-3">
                <input
                  id="is-mandatory"
                  type="checkbox"
                  checked={isMandatory}
                  onChange={(e) => setIsMandatory(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800"
                />
                <label
                  htmlFor="is-mandatory"
                  className="text-sm font-medium text-slate-300"
                >
                  Mandatory
                </label>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}
            </form>
          ) : null}
        </div>

        {/* Footer */}
        {rule && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-rule-form"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & Approve"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
