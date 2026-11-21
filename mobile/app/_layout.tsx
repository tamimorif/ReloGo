import "../global.css";

import { createContext, useContext, useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabaseConfigurationError } from "@/lib/supabase";
import { loadLocalJourney, type LocalJourney } from "@/lib/localJourney";
import { CURRENT_CONSENT_VERSION, hasCurrentPolicyConsent } from "@/lib/legalConsent";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installGlobalErrorHandler } from "@/lib/errorReporting";

installGlobalErrorHandler();
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient();

interface JourneyContextType {
  journey: LocalJourney | null;
  setJourney: (journey: LocalJourney | null) => void;
}

const JourneyContext = createContext<JourneyContextType>({
  journey: null,
  setJourney: () => {},
});

export function useJourney(): JourneyContextType {
  return useContext(JourneyContext);
}

function RootLayoutInner() {
  const [journey, setJourney] = useState<LocalJourney | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments() as string[];

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    let cancelled = false;
    void loadLocalJourney().catch(() => null).then((localJourney) => {
      if (cancelled) return;
      setJourney(localJourney);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasJourney = journey !== null;
  const hasCurrentConsent = hasCurrentPolicyConsent(
    journey?.consentVersion,
    CURRENT_CONSENT_VERSION,
  );

  useEffect(() => {
    if (isLoading || supabaseConfigurationError) return;
    const inOnboarding = segments[0] === "(auth)" && segments[1] === "onboarding";
    const inReconsent = segments[0] === "(auth)" && segments[1] === "reconsent";
    const inTabs = segments[0] === "(tabs)";

    if (!hasJourney && !inOnboarding) router.replace("/(auth)/onboarding");
    else if (hasJourney && !hasCurrentConsent && !inReconsent) {
      router.replace("/(auth)/reconsent");
    } else if (hasJourney && hasCurrentConsent && !inTabs) {
      router.replace("/(tabs)/checklist");
    }
  }, [hasJourney, hasCurrentConsent, isLoading, segments, router]);

  if (supabaseConfigurationError) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-center text-lg font-semibold text-slate-900">
          This ReloGo build is not configured
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
          Install a configured release to load current official task guidance.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-sm text-slate-500">Opening your checklist…</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <JourneyContext.Provider
        value={{
          journey,
          setJourney,
        }}
      >
        <StatusBar style="dark" />
        <Slot />
      </JourneyContext.Provider>
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <RootLayoutInner />
    </AppErrorBoundary>
  );
}
