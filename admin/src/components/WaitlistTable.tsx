import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database, Province } from "../types/database";
import { PROVINCE_LABELS } from "../types/database";

type WaitlistRow = Database["public"]["Tables"]["waitlist"]["Row"];

const PAGE_SIZE = 50;

function provinceLabel(prov: Province | null): string {
  if (!prov) return "—";
  return PROVINCE_LABELS[prov] ?? prov;
}

export function WaitlistTable() {
  const [signups, setSignups] = useState<WaitlistRow[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch waitlist signups, newest first (first page + total count) ───
  const fetchSignups = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, count, error: fetchErr } = await supabase
      .from("waitlist")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      const rows = data ?? [];
      setSignups(rows);
      setTotalCount(count ?? rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSignups();
  }, [fetchSignups]);

  // ── Load the next page, appended below the current rows ───────────────
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setError(null);

    const from = signups.length;
    const { data, error: fetchErr } = await supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      const chunk = data ?? [];
      setSignups((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...chunk.filter((s) => !seen.has(s.id))];
      });
      setHasMore(chunk.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [signups.length]);

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
          <h2 className="text-2xl font-bold text-white">Waitlist</h2>
          <p className="mt-1 text-sm text-slate-400">
            Landing-page waitlist signups — read-only corridor demand data.
          </p>
        </div>
        <button
          onClick={fetchSignups}
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
      {!loading && signups.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Total signups
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {totalCount ?? signups.length}
            </p>
          </div>
        </div>
      )}

      {loading && signups.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : signups.length === 0 && !error ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 py-16 text-center">
          <p className="text-lg font-medium text-slate-400">No signups yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Waitlist entries appear here as soon as people sign up on the
            landing page.
          </p>
        </div>
      ) : signups.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Signed up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {signups.map((signup) => (
                <tr
                  key={signup.id}
                  className="bg-slate-800/40 transition hover:bg-slate-800"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                    {signup.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                    {provinceLabel(signup.origin_province)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                    {provinceLabel(signup.dest_province)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {fmtDate(signup.created_at)}
                  </td>
                </tr>
              ))}
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
    </>
  );
}
