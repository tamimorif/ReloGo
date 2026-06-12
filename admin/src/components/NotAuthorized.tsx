interface NotAuthorizedProps {
  /** Called when the user clicks "Sign out" (e.g. App's handleLogout). */
  onSignOut: () => void | Promise<void>;
}

/**
 * Shown when an authenticated session exists but the is_admin() RPC
 * returned false (or errored). Admin access is granted exclusively
 * server-side via the admin_users table — there is nothing the client
 * can do to escalate, so the only action offered is signing out.
 */
export function NotAuthorized({ onSignOut }: NotAuthorizedProps) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-700">
            <svg
              className="h-6 w-6 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-white">
            This account does not have admin access
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Admin access is managed server-side via the{" "}
            <code className="rounded bg-slate-700 px-1 py-0.5 font-mono text-xs text-slate-300">
              admin_users
            </code>{" "}
            table. If you believe this is a mistake, ask an existing
            administrator to add your account.
          </p>

          <button
            onClick={onSignOut}
            className="mt-6 w-full rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
