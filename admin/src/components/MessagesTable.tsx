import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { SupportThread, SupportThreadStatus } from "../types/database";
import { ThreadModal } from "./ThreadModal";

const STATUS_STYLES: Record<SupportThreadStatus, string> = {
  AI: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  AWAITING_HUMAN: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  HUMAN: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  RESOLVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const STATUS_LABELS: Record<SupportThreadStatus, string> = {
  AI: "AI",
  AWAITING_HUMAN: "Awaiting human",
  HUMAN: "Human",
  RESOLVED: "Resolved",
};

function StatusBadge({ status }: { status: SupportThreadStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function MessagesTable() {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // ── Fetch all support threads, newest activity first ──────────────────
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setThreads(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // ── Aggregate stats ───────────────────────────────────────────────────
  const awaitingCount = useMemo(
    () => threads.filter((t) => t.status === "AWAITING_HUMAN").length,
    [threads],
  );

  // ── After modal close (refetch to reflect status / activity changes) ──
  const handleModalClose = useCallback(() => {
    setSelectedThreadId(null);
    fetchThreads();
  }, [fetchThreads]);

  // ── Helpers ───────────────────────────────────────────────────────────
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
          <h2 className="text-2xl font-bold text-white">Messages</h2>
          <p className="mt-1 text-sm text-slate-400">
            Support chat threads. The AI answers general how-to questions;
            escalated threads wait for a human to take over.
          </p>
        </div>
        <button
          onClick={fetchThreads}
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

      {/* Stats strip */}
      {!loading && threads.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Total threads
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {threads.length}
            </p>
          </div>
          <div
            className={`rounded-xl border px-4 py-3 ${
              awaitingCount > 0
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-slate-700 bg-slate-800"
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Awaiting human
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                awaitingCount > 0 ? "text-amber-300" : "text-white"
              }`}
            >
              {awaitingCount}
            </p>
          </div>
        </div>
      )}

      {loading && threads.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : threads.length === 0 && !error ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 py-16 text-center">
          <p className="text-lg font-medium text-slate-400">No threads yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Conversations appear here as soon as users start a support chat.
          </p>
        </div>
      ) : threads.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {threads.map((thread) => {
                const needsAttention = thread.status === "AWAITING_HUMAN";
                return (
                  <tr
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    className={`cursor-pointer transition hover:bg-slate-800 ${
                      needsAttention
                        ? "bg-amber-500/5"
                        : "bg-slate-800/40"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                      {fmtDate(thread.last_message_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={thread.status} />
                    </td>
                    <td className="max-w-md px-4 py-3 font-medium text-white">
                      <div className="truncate" title={thread.subject ?? undefined}>
                        {thread.subject ?? (
                          <span className="font-normal italic text-slate-500">
                            (no subject)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-mono text-xs text-slate-400">
                        {thread.user_id.slice(0, 8)}…
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── Thread Modal ── */}
      {selectedThreadId && (
        <ThreadModal
          threadId={selectedThreadId}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}
