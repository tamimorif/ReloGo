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
import {
  supabase,
  supabaseConfigurationError,
} from "@/lib/supabase";
import { sweepTemporaryPDFs } from "@/lib/pdfCleanup";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installGlobalErrorHandler } from "@/lib/errorReporting";
import { withStartupTimeout } from "@/lib/startupTimeout";

// Route uncaught (async/global) errors through the privacy-safe sanitizer as
// early as possible, before any screen renders.
installGlobalErrorHandler();

// Prevent auto-hide so we control when splash goes away
SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Worst-case bootstrap reaches a controlled retry surface in eight seconds:
// at most three seconds for encrypted local session restoration, followed by
// five seconds for the consent/profile RPC on a slow or unreachable network.
const SESSION_RESTORE_TIMEOUT_MS = 3_000;
const PROFILE_CHECK_TIMEOUT_MS = 5_000;

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
  hasCurrentConsent: boolean;
  setHasCurrentConsent: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  hasProfile: false,
  setHasProfile: () => {},
  hasCurrentConsent: false,
  setHasCurrentConsent: () => {},
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

// ──────────────────────────────────────────────
// Root Layout
// ──────────────────────────────────────────────

function RootLayoutInner() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(!supabaseConfigurationError);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasCurrentConsent, setHasCurrentConsent] = useState(false);
  const [authLoadFailed, setAuthLoadFailed] = useState(false);
  // "No profile" vs "couldn't check": a failed check must never be treated
  // as a missing profile, or a network blip routes an existing user back to
  // onboarding (whose upsert would overwrite their real move details).
  const [profileCheckFailed, setProfileCheckFailed] = useState(false);

  const router = useRouter();
  const segments = useSegments();

  // Monotonic sequence so a slow, stale profile check can never overwrite
  // the result of a newer check or a child screen's completed mutation.
  const profileCheckSeq = useRef(0);

  // Once React has painted the responsive loading/recovery surface, release
  // the native splash. Remote profile validation must never hold a static
  // launch image on screen for the duration of a slow mobile connection.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  function publishHasProfile(value: boolean) {
    profileCheckSeq.current += 1;
    setHasProfile(value);
    if (!value) {
      setHasCurrentConsent(false);
    }
  }

  function publishHasCurrentConsent(value: boolean) {
    profileCheckSeq.current += 1;
    setHasCurrentConsent(value);
  }

  // PIPEDA hygiene: clear stale PDF files. Android preserves only attachments
  // still inside their share-target grace and reschedules the remaining time.
  useEffect(() => {
    sweepTemporaryPDFs().catch(() => {
      // Best-effort — the directory may simply not exist yet.
    });
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    if (supabaseConfigurationError) return;

    let cancelled = false;
    let authEventSeen = false;

    // Get initial session
    withStartupTimeout(
      supabase.auth.getSession(),
      SESSION_RESTORE_TIMEOUT_MS,
    )
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
          setHasProfile(false);
          setHasCurrentConsent(false);
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
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // getSession() owns bootstrap, including storage/config failure. Recent
      // Supabase clients also emit INITIAL_SESSION from this subscription;
      // processing both would launch duplicate consent RPCs on every startup.
      if (event === "INITIAL_SESSION") return;

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
        setHasCurrentConsent(false);
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
    const controller = new AbortController();
    try {
      const { data, error } = await withStartupTimeout(
        supabase
          .rpc("get_policy_consent_state")
          .abortSignal(controller.signal),
        PROFILE_CHECK_TIMEOUT_MS,
        () => controller.abort(),
      );

      if (seq !== profileCheckSeq.current) {
        return; // a newer check superseded this one — discard stale result
      }

      if (error) {
        console.error("Error checking profile:", error);
        setProfileCheckFailed(true);
        return;
      }

      setProfileCheckFailed(false);
      // The RPC is authoritative, including false results after a policy bump
      // or session change. Child mutations increment profileCheckSeq so an
      // older in-flight result is discarded before reaching this point.
      setHasProfile(data.has_profile);
      setHasCurrentConsent(data.has_current_consent);
      if (data.has_current_consent && data.profile) {
        // Seed the checklist/profile query with the profile already returned
        // by the consent gate. Rules and progress can now start together,
        // removing one cellular-network round trip from a warm launch.
        queryClient.setQueryData(["profile", userId], data.profile);
      } else {
        queryClient.removeQueries({ queryKey: ["profile", userId] });
      }
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
      const { data, error } = await withStartupTimeout(
        supabase.auth.getSession(),
        SESSION_RESTORE_TIMEOUT_MS,
      );
      if (error) throw error;

      const nextSession = data.session;
      setSession(nextSession);
      if (nextSession) {
        checkProfile(nextSession.user.id);
      } else {
        profileCheckSeq.current += 1;
        setHasProfile(false);
        setHasCurrentConsent(false);
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

    const routePath = segments.join("/");
    const inOnboarding = routePath === "(auth)/onboarding";
    const inReconsent = routePath === "(auth)/reconsent";
    const inTabsGroup = segments[0] === "(tabs)";

    if (!session) {
      // Not signed in — go to onboarding (which handles sign-up)
      if (!inOnboarding) {
        router.replace("/(auth)/onboarding");
      }
    } else if (!hasProfile) {
      // Signed in but no profile — only when the check definitively resolved
      // "no row". A FAILED check holds the route (the retry screen below
      // renders) instead of assuming "new user".
      if (!profileCheckFailed && !inOnboarding) {
        router.replace("/(auth)/onboarding");
      }
    } else if (!hasCurrentConsent) {
      // A stored profile is not enough: policy versions must match exactly.
      // This also blocks direct navigation back into any tab route.
      if (!inReconsent) {
        router.replace("/(auth)/reconsent");
      }
    } else {
      // Signed in with a profile and current legal consent — go to tabs.
      if (!inTabsGroup) {
        router.replace("/(tabs)/checklist");
      }
    }
  }, [
    session,
    hasProfile,
    hasCurrentConsent,
    isLoading,
    authLoadFailed,
    profileCheckFailed,
    segments,
    router,
  ]);

  if (supabaseConfigurationError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-center text-lg font-semibold text-slate-900">
          This ReloGo build isn't configured
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
          Install the latest release or contact ReloGo support. Your on-device
          personal information is unchanged.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-slate-50 px-8"
        accessibilityLabel="Loading your ReloGo checklist"
      >
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-4 text-center text-sm text-slate-500">
          Getting your checklist ready…
        </Text>
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
  if (session && profileCheckFailed) {
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
        value={{
          session,
          isLoading,
          hasProfile,
          setHasProfile: publishHasProfile,
          hasCurrentConsent,
          setHasCurrentConsent: publishHasCurrentConsent,
        }}
      >
        <StatusBar style="auto" />
        <Slot />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

// The crash boundary wraps the whole app — including the loading and retry
// screens — so any render failure lands on the recovery UI, never a raw crash.
export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <RootLayoutInner />
    </AppErrorBoundary>
  );
}
