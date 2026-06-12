import { useState, useEffect, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { LoginForm } from "./components/LoginForm";
import { AlertsTable } from "./components/AlertsTable";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* ─── Top navigation ─── */}
      <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-800/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              R
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              ReloGo <span className="font-normal text-slate-400">Admin</span>
            </h1>
          </div>

          {session && (
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-slate-400 sm:inline">
                {session.user.email}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {session ? <AlertsTable /> : <LoginForm />}
      </main>
    </div>
  );
}
