import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { AdminUserListRow, Province } from "../types/database";
import { PROVINCE_LABELS } from "../types/database";
import { UserDetailModal } from "./UserDetailModal";

function corridorLabel(
  origin: Province | null,
  dest: Province | null,
): string {
  if (!origin || !dest) return "—";
  return `${PROVINCE_LABELS[origin]} → ${PROVINCE_LABELS[dest]}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    dateStyle: "medium",
  });
}

/**
 * For DATE columns (bare "YYYY-MM-DD"): new Date(iso) would parse as UTC
 * midnight and render the previous day everywhere west of UTC — i.e. all
 * of Canada. Anchor to local midnight instead.
 */
function fmtDateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    dateStyle: "medium",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const PAGE_SIZE = 50;

export function UsersTable() {
  const [users, setUsers] = useState<AdminUserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // The RPC returns every user in one payload; paginate the render
  // client-side so the table stays manageable as the user base grows.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Fetch all users via the admin RPC ─────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase.rpc("admin_list_users");

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setUsers(data ?? []);
      setVisibleCount(PAGE_SIZE);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Aggregate stats ───────────────────────────────────────────────────
  const topCorridors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      if (!u.origin_prov || !u.dest_prov) continue;
      const label = corridorLabel(u.origin_prov, u.dest_prov);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [users]);

  const visibleUsers = useMemo(
    () => users.slice(0, visibleCount),
    [users, visibleCount],
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Users</h2>
          <p className="mt-1 text-sm text-slate-400">
            Server-side data only — identity details (name, address, ID
            numbers) live on each user's device and are not visible here.
          </p>
        </div>
        <button
          onClick={fetchUsers}
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
      {!loading && users.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Total users
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {users.length}
            </p>
          </div>
          {topCorridors.map(([label, count]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
            >
              <p className="truncate text-xs uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{count}</p>
            </div>
          ))}
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : users.length === 0 && !error ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 py-16 text-center">
          <p className="text-lg font-medium text-slate-400">No users yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Profiles appear here as soon as people complete mobile onboarding.
          </p>
        </div>
      ) : users.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Corridor</th>
                <th className="px-4 py-3">Move date</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Kids</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {visibleUsers.map((user) => (
                <tr
                  key={user.user_id}
                  onClick={() => setSelectedUserId(user.user_id)}
                  className="cursor-pointer bg-slate-800/40 transition hover:bg-slate-800"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-mono text-xs text-slate-400">
                      {user.user_id.slice(0, 8)}…
                    </span>
                    <div className="text-xs font-medium text-white">
                      {user.is_anonymous
                        ? "Anonymous"
                        : (user.email ?? "—")}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                    {corridorLabel(user.origin_prov, user.dest_prov)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                    {fmtDateOnly(user.move_date)}
                  </td>
                  <td className="px-4 py-3">{user.has_vehicle ? "✅" : "—"}</td>
                  <td className="px-4 py-3">
                    {user.has_dependents ? "✅" : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`font-semibold ${
                        user.tasks_total > 0 &&
                        user.tasks_completed >= user.tasks_total
                          ? "text-emerald-400"
                          : "text-slate-200"
                      }`}
                    >
                      {user.tasks_completed} / {user.tasks_total}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {fmtDate(user.joined_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {fmtDateTime(user.last_sign_in_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── Load more ── */}
      {!loading && visibleCount < users.length && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
          >
            Load more
          </button>
        </div>
      )}

      {/* ── User Detail Modal ── */}
      {selectedUserId && (
        <UserDetailModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  );
}
