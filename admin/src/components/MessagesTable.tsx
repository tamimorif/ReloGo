import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { SupportThread, SupportThreadStatus } from "../types/database";
import { ThreadModal } from "./ThreadModal";

const PAGE_SIZE = 50;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Loaded-row count, readable from stable callbacks (realtime refetches
  // must cover every page already on screen, not just the first).
  const loadedCountRef = useRef(0);
  useEffect(() => {
    loadedCountRef.current = threads.length;
  }, [threads]);

  // ── Fetch support threads, newest activity first ──────────────────────
  // `background` refetches (realtime) refresh the loaded rows in place
  // without blanking the table behind the loading spinner.
  const fetchThreads = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }

    const limit = Math.max(loadedCountRef.current, PAGE_SIZE);
    const { data, error: fetchErr } = await supabase
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .range(0, limit - 1);

    if (fetchErr) {
      if (!background) setError(fetchErr.message);
    } else {
      const rows = data ?? [];
      setThreads(rows);
      setHasMore(rows.length === limit);
    }
    if (!background) setLoading(false);
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // ── Realtime: inbox reflects new threads / status changes live ────────
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel("support_threads_inbox")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_threads",
        },
        () => {
          // Refetch (rather than hand-merge) so ordering, the awaiting
          // counter, and deletes all stay correct.
          fetchThreads(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchThreads]);

  // ── Load the next page, appended below the current rows ───────────────
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setError(null);

    const from = loadedCountRef.current;
    const { data, error: fetchErr } = await supabase
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      const chunk = data ?? [];
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...chunk.filter((t) => !seen.has(t.id))];
      });
      setHasMore(chunk.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, []);

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
          onClick={() => fetchThreads()}
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

      {/* ── Load more ── */}
      {!loading && hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-600 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

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
