/**
 * Mandatory legal-policy re-consent for an existing profile.
 *
 * The root auth gate routes here whenever the stored consent version is not
 * exactly the version shipped by this app. The server chooses the persisted
 * version and timestamp; this screen sends no profile fields or on-device PII.
 */
import { useState } from "react";
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
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/_layout";
import { deleteAccount, signOutAccount } from "@/lib/account";
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "@/lib/legalConsent";
import { supabase } from "@/lib/supabase";

export default function ReconsentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    session,
    setHasProfile,
    setHasCurrentConsent,
  } = useAuth();
  const [hasConsented, setHasConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountAction, setAccountAction] = useState<
    "delete" | "signout" | null
  >(null);
  const isBusy = isSubmitting || accountAction !== null;

  async function handleContinue() {
    if (!hasConsented) {
      Alert.alert(
        "Consent Required",
        "Please agree to the current Privacy Policy and Terms of Service to continue.",
      );
      return;
    }

    if (!session) {
      Alert.alert(
        "Session unavailable",
        "Please restart ReloGo and try again.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: acceptedVersion, error } = await supabase.rpc(
        "accept_current_policies",
      );
      if (error || typeof acceptedVersion !== "string") {
        throw new Error("Policy acceptance was not confirmed");
      }

      // The server owns the current version. This deliberately does not
      // compare against the version baked into the installed binary: an older
      // app can still present the current hosted legal pages and accept the
      // server-current release.
      const { data: consentState, error: stateError } = await supabase.rpc(
        "get_policy_consent_state",
      );
      if (
        stateError ||
        consentState?.has_current_consent !== true ||
        !consentState.profile ||
        consentState.accepted_version !== consentState.current_version ||
        acceptedVersion !== consentState.current_version
      ) {
        throw new Error("Policy acceptance was not confirmed");
      }

      queryClient.setQueryData(
        ["profile", session.user.id],
        consentState.profile,
      );
      setHasCurrentConsent(true);
      router.replace("/(tabs)/checklist");
    } catch {
      Alert.alert(
        "Couldn't save your consent",
        "Check your connection and try again. Your on-device personal info is unchanged.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete My Data",
      "This permanently deletes your anonymous account, checklist progress, and all personal info stored on this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            setAccountAction("delete");
            try {
              await deleteAccount();
              queryClient.clear();
              setHasProfile(false);
              setHasCurrentConsent(false);
              router.replace("/(auth)/onboarding");
            } catch {
              Alert.alert(
                "Deletion failed",
                "Couldn't delete your account. Check your connection and try again.",
              );
            } finally {
              setAccountAction(null);
            }
          },
        },
      ],
    );
  }

  function handleSignOut() {
    Alert.alert(
      "Sign out",
      "Signing out removes personal info and filled PDFs from this device. Because your account is anonymous, its checklist progress may not be recoverable. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            setAccountAction("signout");
            try {
              await signOutAccount();
              queryClient.clear();
              setHasProfile(false);
              setHasCurrentConsent(false);
              router.replace("/(auth)/onboarding");
            } catch {
              Alert.alert(
                "Sign out failed",
                "Couldn't finish signing out safely. Please try again.",
              );
            } finally {
              setAccountAction(null);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 48 }}
    >
      <View className="bg-blue-600 px-6 pb-8 pt-16">
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
            Your name, date of birth, street address, driver's licence number,
            and health-card number remain only on this device.
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
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>{" "}
            and{" "}
            <Text
              className="font-semibold text-blue-600"
              onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
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

        <View className="mt-8 border-t border-slate-200 pt-6">
          <Text className="text-center text-sm leading-5 text-slate-500">
            If you do not agree to the updated policies, you can permanently
            delete your account or sign out without accepting them.
          </Text>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={isBusy}
            className="mt-4 h-12 items-center justify-center rounded-xl border border-red-200 bg-red-50"
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete My Data without accepting the updated policies"
            accessibilityState={{ disabled: isBusy }}
          >
            {accountAction === "delete" ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text className="font-semibold text-red-700">
                Delete My Data
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignOut}
            disabled={isBusy}
            className="mt-3 h-12 items-center justify-center rounded-xl"
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Sign out without accepting the updated policies"
            accessibilityState={{ disabled: isBusy }}
          >
            {accountAction === "signout" ? (
              <ActivityIndicator color="#475569" />
            ) : (
              <Text className="font-semibold text-slate-600">Sign out</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
