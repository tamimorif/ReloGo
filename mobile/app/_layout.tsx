/**
 * Root layout — wraps the entire app with:
 * 1. Supabase auth session provider
 * 2. NativeWind CSS import
 * 3. Splash screen management
 */
import "../global.css";

import { useEffect, useState, createContext, useContext } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Prevent auto-hide so we control when splash goes away
SplashScreen.preventAutoHideAsync();

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

  const router = useRouter();
  const segments = useSegments();

  // Listen for auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);

      if (initialSession) {
        // Check if user has a profile
        checkProfile(initialSession.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        checkProfile(newSession.user.id);
      } else {
        setHasProfile(false);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error checking profile:", error);
      }

      setHasProfile(!!data);
    } catch (err) {
      console.error("Profile check failed:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // Route protection
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

    if (!session) {
      // Not signed in — go to onboarding (which handles sign-up)
      if (!inAuthGroup) {
        router.replace("/(auth)/onboarding");
      }
    } else if (!hasProfile) {
      // Signed in but no profile
      if (!inAuthGroup) {
        router.replace("/(auth)/onboarding");
      }
    } else {
      // Signed in with profile — go to tabs
      if (!inTabsGroup) {
        router.replace("/(tabs)/checklist");
      }
    }
  }, [session, hasProfile, isLoading, segments]);

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

  return (
    <AuthContext.Provider value={{ session, isLoading, hasProfile, setHasProfile }}>
      <StatusBar style="auto" />
      <Slot />
    </AuthContext.Provider>
  );
}
