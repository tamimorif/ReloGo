/**
 * Onboarding screen.
 *
 * Collects the user's relocation details:
 * - Origin province
 * - Destination province
 * - Move date
 * - Has vehicle?
 * - Has dependents?
 *
 * Also handles anonymous sign-up if no session exists.
 * On submit, creates a user_profiles row in Supabase.
 */
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import {
  withAbortableTimeout,
  withStartupTimeout,
} from "@/lib/startupTimeout";
import {
  CURRENT_CONSENT_VERSION,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "@/lib/legalConsent";
import {
  Province,
  PROVINCES,
  PROVINCE_LABELS,
  UserProfileInsert,
} from "@/types/database";

const ONBOARDING_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Format a Date as YYYY-MM-DD in LOCAL time. toISOString() converts to UTC,
 * which shifts evening picks to the next calendar day in every Canadian
 * timezone — and every checklist deadline is computed from this date.
 */
function formatLocalDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, setHasProfile, setHasCurrentConsent } = useAuth();

  const [originProvince, setOriginProvince] = useState<Province | null>(null);
  const [destinationProvince, setDestinationProvince] =
    useState<Province | null>(null);
  const [moveDate, setMoveDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [hasDependents, setHasDependents] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Province picker state
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);

  function handleDateChange(
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setMoveDate(selectedDate);
    }
  }

  async function handleSubmit() {
    if (!originProvince) {
      Alert.alert(
        "Missing Info",
        "Please select your origin province or territory.",
      );
      return;
    }
    if (!destinationProvince) {
      Alert.alert(
        "Missing Info",
        "Please select your destination province or territory.",
      );
      return;
    }
    if (originProvince === destinationProvince) {
      Alert.alert(
        "Same jurisdiction",
        "Origin and destination must be different provinces or territories.",
      );
      return;
    }
    // PIPEDA: no account may be created (even anonymously) before the user
    // has affirmatively agreed to the privacy policy and terms.
    if (!hasConsented) {
      Alert.alert(
        "Consent Required",
        "Please agree to the Privacy Policy and Terms of Service to continue.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      let userId = session?.user?.id;

      // If no session, sign in anonymously.
      // Requires "Allow anonymous sign-ins" to be enabled in the
      // Supabase dashboard (Authentication → Providers).
      if (!userId) {
        const { data: authData, error: authError } = await withStartupTimeout(
          supabase.auth.signInAnonymously(),
          ONBOARDING_REQUEST_TIMEOUT_MS,
        );

        if (authError) {
          throw authError;
        }
        userId = authData.user?.id;
      }

      if (!userId) {
        throw new Error("Unable to create user account");
      }

      const profile: UserProfileInsert = {
        id: userId,
        origin_prov: originProvince,
        dest_prov: destinationProvince,
        move_date: formatLocalDate(moveDate),
        has_vehicle: hasVehicle,
        has_dependents: hasDependents,
        consent_version: CURRENT_CONSENT_VERSION,
      };

      // Insert first, then fall back to an update if the row already exists —
      // a prior submit that timed out client-side, or a transient checkProfile
      // failure routing an existing user back here. The user's freshly entered
      // details replace the old ones instead of being silently discarded.
      //
      // This deliberately is NOT an upsert. Migration 019 gates
      // user_profiles UPDATE on has_current_policy_consent(), which is true
      // only once a profile row already records the current policy version. A
      // single INSERT ... ON CONFLICT DO UPDATE (what .upsert() emits) is
      // therefore rejected outright for a first-time user, whose row does not
      // exist yet: the consent that would authorise the write is precisely
      // what the write is trying to create. Splitting the two statements keeps
      // the retry behaviour while letting the plain INSERT policy authorise
      // the first-run case.
      const { error: insertError } = await withAbortableTimeout(
        (signal) =>
          supabase
            .from("user_profiles")
            .insert(profile)
            .abortSignal(signal),
        ONBOARDING_REQUEST_TIMEOUT_MS,
      );

      if (insertError) {
        // 23505 = unique violation, i.e. this user already has a profile row.
        // Anything else is a real failure.
        if (insertError.code !== "23505") {
          throw insertError;
        }

        const { error: updateError } = await withAbortableTimeout(
          (signal) =>
            supabase
              .from("user_profiles")
              .update(profile)
              .eq("id", userId)
              .abortSignal(signal),
          ONBOARDING_REQUEST_TIMEOUT_MS,
        );

        if (updateError) {
          throw updateError;
        }
      }

      // INSERT ... RETURNING is intentionally unavailable here: the
      // consent-gated SELECT policy cannot see a first-time row in the same
      // statement snapshot. Confirm through the existing SECURITY DEFINER
      // consent RPC instead, which returns the authoritative allowlisted row.
      const { data: consentState, error: consentError } =
        await withAbortableTimeout(
          (signal) =>
            supabase
              .rpc("get_policy_consent_state")
              .abortSignal(signal),
          ONBOARDING_REQUEST_TIMEOUT_MS,
        );
      if (
        consentError ||
        consentState?.has_profile !== true ||
        consentState.has_current_consent !== true ||
        !consentState.profile
      ) {
        throw new Error("Profile write was not confirmed");
      }

      // Seed the checklist cache so first-run onboarding does not immediately
      // fetch the row again after this authoritative confirmation.
      queryClient.setQueryData(["profile", userId], consentState.profile);
      setHasProfile(true);
      setHasCurrentConsent(true);
      router.replace("/(tabs)/checklist");
    } catch {
      // Keep provider/database internals out of the UI. The onboarding payload
      // is non-PII, but raw backend errors can still expose implementation
      // details and are not actionable for the user.
      Alert.alert(
        "Couldn't finish setup",
        "Check your connection and try again. Your on-device personal info is unchanged.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderProvincePicker(
    label: string,
    selected: Province | null,
    isOpen: boolean,
    onToggle: () => void,
    onSelect: (p: Province) => void,
  ) {
    return (
      <View className="mb-4">
        <Text className="mb-1 text-sm font-medium text-slate-700">
          {label}
        </Text>
        <TouchableOpacity
          onPress={onToggle}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={`${label}: ${selected ? PROVINCE_LABELS[selected] : "none selected"}`}
          accessibilityHint="Opens the province and territory list"
        >
          <Text
            className={`text-base ${selected ? "text-slate-900" : "text-slate-400"}`}
          >
            {selected
              ? PROVINCE_LABELS[selected]
              : "Select province or territory…"}
          </Text>
        </TouchableOpacity>

        {isOpen && (
          <View className="mt-2 rounded-xl border border-slate-200 bg-white shadow-sm">
            <ScrollView
              nestedScrollEnabled
              style={{ maxHeight: 220 }}
              className="px-2 py-2"
            >
              {PROVINCES.map((prov) => (
                <TouchableOpacity
                  key={prov}
                  onPress={() => {
                    onSelect(prov);
                    onToggle();
                  }}
                  className={`rounded-lg px-3 py-2.5 ${
                    selected === prov ? "bg-blue-50" : ""
                  }`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selected === prov }}
                  accessibilityLabel={PROVINCE_LABELS[prov]}
                >
                  <Text
                    className={`text-base ${
                      selected === prov
                        ? "font-semibold text-blue-600"
                        : "text-slate-700"
                    }`}
                  >
                    {PROVINCE_LABELS[prov]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View className="bg-blue-600 px-6 pb-8 pt-16">
        <Text className="text-3xl font-bold text-white">🇨🇦 ReloGo</Text>
        <Text className="mt-2 text-base text-blue-100">
          Your Canadian move guide. Tell us about your move and we'll build your
          personalised checklist.
        </Text>
      </View>

      {/* Form */}
      <View className="px-6 pt-6">
        {/* Origin Province */}
        {renderProvincePicker(
          "Moving from",
          originProvince,
          showOriginPicker,
          () => {
            setShowOriginPicker(!showOriginPicker);
            setShowDestPicker(false);
          },
          setOriginProvince,
        )}

        {/* Destination Province */}
        {renderProvincePicker(
          "Moving to",
          destinationProvince,
          showDestPicker,
          () => {
            setShowDestPicker(!showDestPicker);
            setShowOriginPicker(false);
          },
          setDestinationProvince,
        )}

        {/* Move Date */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-slate-700">
            Move date
          </Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Move date, ${moveDate.toLocaleDateString(
              "en-CA",
              { year: "numeric", month: "long", day: "numeric" },
            )}`}
            accessibilityHint="Opens the date picker"
          >
            <Text className="text-base text-slate-900">
              {moveDate.toLocaleDateString("en-CA", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={moveDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              minimumDate={new Date()}
              onChange={handleDateChange}
            />
          )}
        </View>

        {/* Has Vehicle */}
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <View className="flex-1">
            <Text className="text-base font-medium text-slate-900">
              Bringing a vehicle?
            </Text>
            <Text className="text-sm text-slate-500">
              We'll add licence & registration tasks
            </Text>
          </View>
          <Switch
            value={hasVehicle}
            onValueChange={setHasVehicle}
            trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
            thumbColor={hasVehicle ? "#2563eb" : "#f1f5f9"}
            accessibilityLabel="Bringing a vehicle?"
          />
        </View>

        {/* Has Dependents */}
        <View className="mb-6 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <View className="flex-1">
            <Text className="text-base font-medium text-slate-900">
              Moving with kids?
            </Text>
            <Text className="text-sm text-slate-500">
              We'll add school enrollment & child benefit tasks
            </Text>
          </View>
          <Switch
            value={hasDependents}
            onValueChange={setHasDependents}
            trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
            thumbColor={hasDependents ? "#2563eb" : "#f1f5f9"}
            accessibilityLabel="Moving with kids?"
          />
        </View>

        {/* Consent (required before any account is created) */}
        <View className="mb-6 flex-row items-start rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <TouchableOpacity
            onPress={() => setHasConsented(!hasConsented)}
            activeOpacity={0.7}
            className="h-11 w-11 -m-2.5 mr-0 items-center justify-center"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: hasConsented }}
            accessibilityLabel="I agree to the Privacy Policy and Terms of Service"
          >
            <View
              className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                hasConsented
                  ? "border-blue-600 bg-blue-600"
                  : "border-slate-300 bg-white"
              }`}
            >
              {hasConsented && (
                <Ionicons name="checkmark" size={15} color="#ffffff" />
              )}
            </View>
          </TouchableOpacity>
          <Text className="ml-2 flex-1 text-sm leading-5 text-slate-600">
            I agree to the{" "}
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
            . Your personal details stay on this device.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitting}
          className={`items-center rounded-xl py-4 ${
            isSubmitting ? "bg-blue-400" : hasConsented ? "bg-blue-600" : "bg-slate-300"
          }`}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-lg font-bold text-white">
              Build My Checklist →
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
