import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AlertWithSource } from "../types/database";
import { EditRuleModal } from "./EditRuleModal";

export function AlertsTable() {
  const [alerts, setAlerts] = useState<AlertWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAlert, setEditingAlert] = useState<AlertWithSource | null>(null);

  // ── Fetch pending alerts with joined source info ──────────────────────
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("rule_change_alerts")
      .select(
        "id, source_id, corridor_rule_id, old_hash, new_hash, status, created_at, official_sources(agency_name, official_url)",
      )
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setAlerts((data as unknown as AlertWithSource[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // ── Dismiss an alert ──────────────────────────────────────────────────
  const handleDismiss = async (alertId: string) => {
    const { error: updateErr } = await supabase
      .from("rule_change_alerts")
      .update({ status: "DISMISSED" })
      .eq("id", alertId);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    // Remove from local state
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  // ── After modal save ──────────────────────────────────────────────────
  const handleModalClose = (saved: boolean) => {
    setEditingAlert(null);
    if (saved) {
      // Re-fetch to reflect the approved status change
      fetchAlerts();
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const truncHash = (hash: string) =>
    hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : "—";

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Pending Alerts</h2>
          <p className="mt-1 text-sm text-slate-400">
            Review detected rule-source changes before they go live.
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          disabled={loading}
          className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && alerts.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 py-16 text-center">
          <p className="text-lg font-medium text-slate-400">
            🎉 No pending alerts
          </p>
          <p className="mt-1 text-sm text-slate-500">
            All rule-source changes have been reviewed.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Agency</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Old Hash</th>
                <th className="px-4 py-3">New Hash</th>
                <th className="px-4 py-3">Detected At</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {alerts.map((alert) => (
                <tr
                  key={alert.id}
                  className="bg-slate-800/40 transition hover:bg-slate-800"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                    {alert.official_sources?.agency_name ?? "—"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-300">
                    <a
                      href={alert.official_sources?.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-slate-600 transition hover:text-blue-400"
                    >
                      {alert.official_sources?.official_url ?? "—"}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">
                    {truncHash(alert.old_hash)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-emerald-400">
                    {truncHash(alert.new_hash)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {fmtDate(alert.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleDismiss(alert.id)}
                        className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => setEditingAlert(alert)}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
                      >
                        Edit Rules
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Rule Modal ── */}
      {editingAlert && (
        <EditRuleModal alert={editingAlert} onClose={handleModalClose} />
      )}
    </>
  );
}
