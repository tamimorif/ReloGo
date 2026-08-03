import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { safeHttpsUrl } from "../lib/safeUrl";
import type { AdminUserDetail, TaskStatus } from "../types/database";
import { PROVINCE_LABELS } from "../types/database";

interface UserDetailModalProps {
  userId: string;
  onClose: () => void;
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  AVAILABLE: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * For DATE columns (bare "YYYY-MM-DD"): anchor to local midnight, otherwise
 * new Date(iso) parses as UTC and renders the previous day across Canada.
 */
function fmtDateOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    dateStyle: "medium",
  });
}

export function UserDetailModal({ userId, onClose }: UserDetailModalProps) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchErr } = await supabase.rpc(
        "admin_get_user_detail",
        { p_user_id: userId },
      );

      if (cancelled) return;
      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        setDetail(data as AdminUserDetail);
      }
      setLoading(false);
    };

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const corridor =
    detail?.origin_prov && detail?.dest_prov
      ? `${PROVINCE_LABELS[detail.origin_prov]} → ${PROVINCE_LABELS[detail.dest_prov]}`
      : "—";

  const completed =
    detail?.tasks.filter((t) => t.status === "COMPLETED").length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">User Detail</h3>
          <button
            onClick={onClose}
            className="text-slate-400 transition hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Account */}
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Account
                </p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">User ID</span>
                    <span className="break-all text-right font-mono text-xs text-slate-300">
                      {detail.user_id}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Identity</span>
                    <span className="text-white">
                      {detail.is_anonymous
                        ? "Anonymous"
                        : (detail.email ?? "—")}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Joined</span>
                    <span className="text-slate-300">
                      {fmtDateTime(detail.joined_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Last sign-in</span>
                    <span className="text-slate-300">
                      {fmtDateTime(detail.last_sign_in_at)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Move details */}
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Move details
                </p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Corridor</span>
                    <span className="font-medium text-white">{corridor}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Move date</span>
                    <span className="text-slate-300">
                      {fmtDateOnly(detail.move_date)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Bringing a vehicle</span>
                    <span className="text-slate-300">
                      {detail.has_vehicle ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Moving with kids</span>
                    <span className="text-slate-300">
                      {detail.has_dependents ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400">Profile updated</span>
                    <span className="text-slate-300">
                      {fmtDateTime(detail.profile_updated_at)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Checklist */}
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Checklist · {completed} of {detail.tasks.length} done
                </p>
                {detail.tasks.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No tasks for this corridor yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.tasks.map((task) => (
                      <li
                        key={task.task_rule_id}
                        className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">
                              {task.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {task.days_deadline !== null
                                ? `Due ${task.days_deadline} days after move`
                                : "No fixed deadline"}
                              {` · ${task.is_mandatory ? "Required" : "Optional"}`}
                              {task.status_updated_at
                                ? ` · Updated ${fmtDateTime(task.status_updated_at)}`
                                : ""}
                            </p>
                            {task.official_sources.length > 0 ? (
                              <ul
                                className="mt-1 space-y-0.5"
                                aria-label={`Official sources for ${task.title}`}
                              >
                                {task.official_sources.map((source) => {
                                  const officialUrl = safeHttpsUrl(
                                    source.official_url,
                                  );

                                  return (
                                    <li key={source.id} className="truncate text-xs">
                                      {officialUrl ? (
                                        <a
                                          href={officialUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          aria-label={`${source.agency_name} official source (opens in a new tab)`}
                                          className="text-blue-400 underline decoration-slate-600 hover:text-blue-300"
                                        >
                                          {source.agency_name}
                                        </a>
                                      ) : (
                                        <span className="text-slate-500">
                                          {source.agency_name} (link unavailable)
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="mt-1 text-xs text-slate-500">
                                No official source linked.
                              </p>
                            )}
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[task.status]}`}
                          >
                            {task.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* PIPEDA note */}
              <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs leading-5 text-slate-500">
                🔒 Identity details (name, address, health card and licence
                numbers, date of birth) are stored only on the user's device
                and are not visible here. (PIPEDA.)
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
