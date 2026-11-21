/** Local policy-version gate for a saved checklist on this device. */
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useJourney } from "@/app/_layout";
import { shouldUseDarkAuthStatusBar } from "@/lib/authStatusBar";
import {
  CURRENT_CONSENT_VERSION,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "@/lib/legalConsent";
import { saveLocalJourney } from "@/lib/localJourney";

export default function ReconsentScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const { journey, setJourney } = useJourney();
  const [hasConsented, setHasConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHeaderPastStatusBar, setIsHeaderPastStatusBar] = useState(false);
  const headerHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const isBusy = isSubmitting;

  function updateHeaderStatusBarStyle(
    scrollOffsetY = scrollOffsetRef.current,
    headerHeight = headerHeightRef.current,
  ) {
    scrollOffsetRef.current = scrollOffsetY;
    headerHeightRef.current = headerHeight;
    setIsHeaderPastStatusBar(
      shouldUseDarkAuthStatusBar(
        scrollOffsetY,
        headerHeight,
        safeAreaInsets.top,
      ),
    );
  }

  async function handleContinue() {
    if (!hasConsented) {
      Alert.alert(
        "Consent Required",
        "Please agree to the current Privacy Policy and Terms of Service to continue.",
      );
      return;
    }

    if (!journey) {
      Alert.alert("Move details missing", "Please enter your route again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedJourney = {
        ...journey,
        consentVersion: CURRENT_CONSENT_VERSION,
      };
      await saveLocalJourney(updatedJourney);
      setJourney(updatedJourney);
      router.replace("/(tabs)/checklist");
    } catch {
      Alert.alert(
        "Couldn't save your choice",
        "Please try again. Your move details remain on this device.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar style={isHeaderPastStatusBar ? "dark" : "light"} />
      <ScrollView
        className="flex-1 bg-slate-50"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
        onScroll={(event) =>
          updateHeaderStatusBarStyle(event.nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
      >
        <View
          className="bg-blue-600 px-6 pb-8 pt-16"
          onLayout={(event) =>
            updateHeaderStatusBarStyle(
              scrollOffsetRef.current,
              event.nativeEvent.layout.height,
            )
          }
        >
          <Text className="text-3xl font-bold text-white">Policy update</Text>
          <Text className="mt-2 text-base leading-6 text-blue-100">
            Please review the current Privacy Policy and Terms of Service before
            continuing to your checklist.
          </Text>
        </View>

        <View className="flex-1 px-6 pt-8">
          <View className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
            <Text className="text-base font-semibold text-slate-900">
              Sensitive details stay on this device
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-600">
              Your route and checklist progress stay on this device. Support
              conversations are sent to the support team so a person can reply.
            </Text>
          </View>

          <View className="mt-6 flex-row items-start rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <TouchableOpacity
              onPress={() => setHasConsented((value) => !value)}
              disabled={isBusy}
              activeOpacity={0.7}
              className="-m-2.5 mr-0 h-11 w-11 items-center justify-center"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hasConsented, disabled: isBusy }}
              accessibilityLabel="I agree to the current Privacy Policy and Terms of Service"
            >
              <View
                className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                  hasConsented
                    ? "border-blue-600 bg-blue-600"
                    : "border-slate-300 bg-white"
                }`}
              >
                {hasConsented ? (
                  <Ionicons name="checkmark" size={15} color="#ffffff" />
                ) : null}
              </View>
            </TouchableOpacity>

            <Text className="ml-2 flex-1 text-sm leading-5 text-slate-600">
              I agree to the current{" "}
              <Text
                className="font-semibold text-blue-600"
                onPress={() =>
                  Linking.openURL(PRIVACY_POLICY_URL).catch(() =>
                    Alert.alert(
                      "Couldn't open the official website",
                      "Please try again in a moment.",
                    ),
                  )
                }
                accessibilityRole="link"
              >
                Privacy Policy
              </Text>{" "}
              and{" "}
              <Text
                className="font-semibold text-blue-600"
                onPress={() =>
                  Linking.openURL(TERMS_OF_SERVICE_URL).catch(() =>
                    Alert.alert(
                      "Couldn't open the official website",
                      "Please try again in a moment.",
                    ),
                  )
                }
                accessibilityRole="link"
              >
                Terms of Service
              </Text>
              .
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleContinue}
            disabled={isBusy}
            className={`mt-6 items-center rounded-xl py-4 ${
              isSubmitting
                ? "bg-blue-400"
                : hasConsented
                  ? "bg-blue-600"
                  : "bg-slate-300"
            }`}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Accept the current policies and continue"
            accessibilityState={{ disabled: isBusy }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-lg font-bold text-white">
                Accept and continue
              </Text>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: safeAreaInsets.top,
          zIndex: 1,
          elevation: 1,
          backgroundColor: isHeaderPastStatusBar ? "#f8fafc" : "#2563eb",
        }}
      />
    </View>
  );
}
