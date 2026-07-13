/**
 * Root layout — wraps the entire app with:
 * 1. Supabase auth session provider
 * 2. TanStack Query client provider
 * 3. NativeWind CSS import
 * 4. Splash screen management
 */
import "../global.css";

import { useEffect, useRef, useState, createContext, useContext } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { wipeFilledPDFs } from "@/lib/pdfEngine";

// Prevent auto-hide so we control when splash goes away
SplashScreen.preventAutoHideAsync();

// Module-level client so cache survives re-renders of the root layout.
const queryClient = new QueryClient();

// ──────────────────────────────────────────────
// Auth Context
// ──────────────────────────────────────────────

interface AuthContextType {
  session: Session | null;
  isLoading: boolean;
  hasProfile: boolean;
  setHasProfile: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  hasProfile: false,
  setHasProfile: () => {},
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

// ──────────────────────────────────────────────
// Root Layout
// ──────────────────────────────────────────────

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [authLoadFailed, setAuthLoadFailed] = useState(false);
  // "No profile" vs "couldn't check": a failed check must never be treated
  // as a missing profile, or a network blip routes an existing user back to
  // onboarding (whose upsert would overwrite their real move details).
  const [profileCheckFailed, setProfileCheckFailed] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  // Monotonic sequence so a slow, stale profile check can never overwrite
  // the result of a newer one (or of onboarding's setHasProfile(true)).
  const profileCheckSeq = useRef(0);

  // PIPEDA hygiene: clear any filled PDFs left from a previous session
  // (Android defers cleanup until after the share target has read them).
  useEffect(() => {
    wipeFilledPDFs().catch(() => {
      // Best-effort — the directory may simply not exist yet.
    });
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    let cancelled = false;
    let authEventSeen = false;

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession }, error }) => {
        // onAuthStateChange can win this race. Its newer session is the source
        // of truth, so never overwrite it with this older snapshot.
        if (cancelled || authEventSeen) return;

        if (error) {
          setAuthLoadFailed(true);
          setIsLoading(false);
          return;
        }

        setSession(initialSession);
        setAuthLoadFailed(false);
        if (initialSession) {
          checkProfile(initialSession.user.id);
        } else {
          profileCheckSeq.current += 1;
          setProfileCheckFailed(false);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (cancelled || authEventSeen) return;
        setAuthLoadFailed(true);
        setIsLoading(false);
      });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authEventSeen = true;
      setAuthLoadFailed(false);
      setSession(newSession);

      if (newSession) {
        checkProfile(newSession.user.id);
      } else {
        // A signed-out session must invalidate every in-flight profile query;
        // otherwise a late response can restore stale profile/loading state.
        profileCheckSeq.current += 1;
        setHasProfile(false);
        setProfileCheckFailed(false);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function checkProfile(userId: string) {
    const seq = ++profileCheckSeq.current;
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (seq !== profileCheckSeq.current) {
        return; // a newer check superseded this one — discard stale result
      }

      if (error) {
        console.error("Error checking profile:", error);
        setProfileCheckFailed(true);
        return;
      }

      setProfileCheckFailed(false);
      // Never downgrade: this SELECT can race onboarding's profile INSERT,
      // and a stale "no row yet" must not bounce the user back to onboarding.
      setHasProfile((prev) => prev || !!data);
    } catch (err) {
      if (seq !== profileCheckSeq.current) {
        return; // a newer check superseded this one — discard stale failure
      }
      console.error("Profile check failed:", err);
      setProfileCheckFailed(true);
    } finally {
      // A stale request must not dismiss the loading state owned by a newer
      // request (or by an auth transition).
      if (seq === profileCheckSeq.current) {
        setIsLoading(false);
      }
    }
  }

  // Manual retry from the error screen below (re-runs the profile check).
  function retryProfileCheck() {
    if (!session) return;
    setProfileCheckFailed(false);
    setIsLoading(true);
    checkProfile(session.user.id);
  }

  async function retryAuthLoad() {
    setAuthLoadFailed(false);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const nextSession = data.session;
      setSession(nextSession);
      if (nextSession) {
        checkProfile(nextSession.user.id);
      } else {
        profileCheckSeq.current += 1;
        setHasProfile(false);
        setProfileCheckFailed(false);
        setIsLoading(false);
      }
    } catch {
      setAuthLoadFailed(true);
      setIsLoading(false);
    }
  }

  // Route protection
  useEffect(() => {
    if (isLoading || authLoadFailed) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

    if (!session) {
      // Not signed in — go to onboarding (which handles sign-up)
      if (!inAuthGroup) {
        router.replace("/(auth)/onboarding");
      }
    } else if (!hasProfile) {
      // Signed in but no profile — only when the check definitively resolved
      // "no row". A FAILED check holds the route (the retry screen below
      // renders) instead of assuming "new user".
      if (!profileCheckFailed && !inAuthGroup) {
        router.replace("/(auth)/onboarding");
      }
    } else {
      // Signed in with profile — go to tabs
      if (!inTabsGroup) {
        router.replace("/(tabs)/checklist");
      }
    }
  }, [
    session,
    hasProfile,
    isLoading,
    authLoadFailed,
    profileCheckFailed,
    segments,
  ]);

  // Hide splash when ready
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (authLoadFailed) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-lg font-semibold text-slate-900">
          Couldn't restore your session
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
          Your local data is unchanged. Please try again.
        </Text>
        <TouchableOpacity
          onPress={retryAuthLoad}
          className="mt-6 rounded-xl bg-blue-600 px-8 py-3.5"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Retry restoring your session"
        >
          <Text className="text-base font-bold text-white">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Profile check failed for a signed-in user: we can't tell "new user" from
  // "network blip", so offer a retry instead of guessing.
  if (session && !hasProfile && profileCheckFailed) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-lg font-semibold text-slate-900">
          Couldn't reach ReloGo
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={retryProfileCheck}
          className="mt-6 rounded-xl bg-blue-600 px-8 py-3.5"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Retry loading your profile"
        >
          <Text className="text-base font-bold text-white">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{ session, isLoading, hasProfile, setHasProfile }}
      >
        <StatusBar style="auto" />
        <Slot />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
