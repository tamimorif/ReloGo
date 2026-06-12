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
  Platform,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import {
  Province,
  PROVINCES,
  PROVINCE_LABELS,
  UserProfileInsert,
} from "@/types/database";

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
  const { session, setHasProfile } = useAuth();

  const [originProvince, setOriginProvince] = useState<Province | null>(null);
  const [destinationProvince, setDestinationProvince] =
    useState<Province | null>(null);
  const [moveDate, setMoveDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [hasDependents, setHasDependents] = useState(false);
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
      Alert.alert("Missing Info", "Please select your origin province.");
      return;
    }
    if (!destinationProvince) {
      Alert.alert("Missing Info", "Please select your destination province.");
      return;
    }
    if (originProvince === destinationProvince) {
      Alert.alert(
        "Same Province",
        "Origin and destination must be different provinces.",
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
        const { data: authData, error: authError } =
          await supabase.auth.signInAnonymously();

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
      };

      // Upsert (last-write-wins): if a profile row already exists — a prior
      // submit that timed out client-side, or a transient checkProfile
      // failure routing an existing user back here — the user's freshly
      // entered details replace it instead of being silently discarded.
      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert(profile, { onConflict: "id" });

      if (profileError) {
        throw profileError;
      }

      setHasProfile(true);
      router.replace("/(tabs)/checklist");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      Alert.alert("Error", message);
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
        >
          <Text
            className={`text-base ${selected ? "text-slate-900" : "text-slate-400"}`}
          >
            {selected ? PROVINCE_LABELS[selected] : "Select province…"}
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
          Your Canadian relocation autopilot. Tell us about your move and we'll
          build your personalised checklist.
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
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitting}
          className={`items-center rounded-xl py-4 ${
            isSubmitting ? "bg-blue-400" : "bg-blue-600"
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
