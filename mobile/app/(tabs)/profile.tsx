/**
 * Profile screen.
 *
 * Three sections:
 * 1. Move details — origin/destination provinces, move date, vehicle and
 *    dependents flags. Stored in Supabase (user_profiles, non-PII only).
 * 2. Personal info — full name, DOB, street address, health card and
 *    driver's licence numbers. PIPEDA: these live ONLY in the device
 *    secure enclave (expo-secure-store) and are never sent to Supabase,
 *    logged, or included in error messages.
 * 3. Account — sign out and "Delete My Data" (server row + cascade,
 *    on-device PII, filled PDFs, local session).
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/_layout";
import { deleteAccount } from "@/lib/account";
import { deletePII, getPII, savePII } from "@/lib/secureStore";
import {
  PIIKey,
  Province,
  PROVINCE_LABELS,
  PROVINCES,
  UserProfile,
} from "@/types/database";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ──────────────────────────────────────────────
// On-device PII fields (never leave the device)
// ──────────────────────────────────────────────

const PII_FIELDS: {
  key: PIIKey;
  label: string;
  placeholder: string;
  sensitive: boolean;
}[] = [
  {
    key: "FULL_NAME",
    label: "Full name",
    placeholder: "e.g. Jane Doe",
    sensitive: false,
  },
  {
    key: "DATE_OF_BIRTH",
    label: "Date of birth",
    placeholder: "YYYY-MM-DD",
    sensitive: false,
  },
  {
    key: "STREET_ADDRESS",
    label: "New street address",
    placeholder: "e.g. 123 Main St, Calgary",
    sensitive: false,
  },
  {
    key: "HEALTH_CARD_NUMBER",
    label: "Health card number",
    placeholder: "Stored on this device only",
    sensitive: true,
  },
  {
    key: "DRIVERS_LICENCE_NUMBER",
    label: "Driver's licence number",
    placeholder: "Stored on this device only",
    sensitive: true,
  },
];

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ──────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────

export default function ProfileScreen() {
  const { session, setHasProfile } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  // ── Move details form state ──────────────────
  const [originProvince, setOriginProvince] = useState<Province | null>(null);
  const [destProvince, setDestProvince] = useState<Province | null>(null);
  const [moveDate, setMoveDate] = useState<Date | null>(null);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [hasDependents, setHasDependents] = useState(false);
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formHydrated, setFormHydrated] = useState(false);

  // ── PII form state (device-only) ─────────────
  const [piiValues, setPiiValues] = useState<Record<PIIKey, string>>({
    FULL_NAME: "",
    DATE_OF_BIRTH: "",
    STREET_ADDRESS: "",
    HEALTH_CARD_NUMBER: "",
    DRIVERS_LICENCE_NUMBER: "",
  });
  const [piiLoaded, setPiiLoaded] = useState(false);
  const [savingPII, setSavingPII] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // 1. Profile ────────────────────────────────
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserProfile> => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Hydrate the form once when the profile first arrives.
  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile || formHydrated) return;
    setOriginProvince(profile.origin_prov);
    setDestProvince(profile.dest_prov);
    setMoveDate(profile.move_date ? parseISODate(profile.move_date) : null);
    setHasVehicle(profile.has_vehicle);
    setHasDependents(profile.has_dependents);
    setFormHydrated(true);
  }, [profileQuery.data, formHydrated]);

  // Load on-device PII once. Values stay in component state only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(
          PII_FIELDS.map(
            async (field) =>
              [field.key, (await getPII(field.key)) ?? ""] as const,
          ),
        );
        if (!cancelled) {
          setPiiValues((prev) => {
            const next = { ...prev };
            for (const [key, value] of entries) next[key] = value;
            return next;
          });
        }
      } catch {
        // Secure store unavailable — leave fields blank. Never log PII.
        if (!cancelled) {
          Alert.alert(
            "Secure storage unavailable",
            "Couldn't read your on-device info. Your data is unchanged.",
          );
        }
      } finally {
        if (!cancelled) setPiiLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Save move details ───────────────────────
  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          origin_prov: originProvince,
          dest_prov: destProvince,
          move_date: moveDate ? toISODate(moveDate) : null,
          has_vehicle: hasVehicle,
          has_dependents: hasDependents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["corridorRules"] });
      Alert.alert("Saved", "Your move details have been updated.");
    },
    onError: () => {
      Alert.alert(
        "Update failed",
        "Couldn't save your move details. Please try again.",
      );
    },
  });

  // ── Handlers ─────────────────────────────────

  function handleDateChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setMoveDate(selectedDate);
    }
  }

  function handleSaveProfile() {
    if (!userId) return;
    if (!originProvince || !destProvince) {
      Alert.alert(
        "Missing Info",
        "Please select both your origin and destination provinces.",
      );
      return;
    }
    if (originProvince === destProvince) {
      Alert.alert(
        "Same Province",
        "Origin and destination must be different provinces.",
      );
      return;
    }
    saveProfileMutation.mutate();
  }

  async function handleSavePII() {
    setSavingPII(true);
    try {
      await Promise.all(
        PII_FIELDS.map((field) => {
          const value = piiValues[field.key].trim();
          return value.length > 0
            ? savePII(field.key, value)
            : deletePII(field.key);
        }),
      );
      Alert.alert(
        "Saved on device",
        "Your personal info is stored securely on this device only.",
      );
    } catch {
      // Never include the underlying error — it could echo PII.
      Alert.alert(
        "Save failed",
        "Couldn't save to secure storage. Please try again.",
      );
    } finally {
      setSavingPII(false);
    }
  }

  function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) {
            Alert.alert("Sign out failed", "Please try again.");
          }
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete My Data",
      "This permanently deletes your account, checklist progress, and all personal info stored on this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount();
              queryClient.clear();
              setHasProfile(false);
            } catch {
              Alert.alert(
                "Deletion failed",
                "Couldn't delete your account. Check your connection and try again.",
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  }

  // ── Render helpers ───────────────────────────

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

  // ── Render guards ────────────────────────────

  if (profileQuery.isError && !profileQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Ionicons
          name={"cloud-offline-outline" as IconName}
          size={44}
          color="#94a3b8"
        />
        <Text className="mt-4 text-lg font-semibold text-slate-900">
          Couldn't load your profile
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={() => profileQuery.refetch()}
          className="mt-6 rounded-xl bg-blue-600 px-8 py-3.5"
          activeOpacity={0.8}
        >
          <Text className="text-base font-bold text-white">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (profileQuery.isPending || !piiLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // ── Main form ────────────────────────────────

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Move details */}
      <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="mb-3 text-lg font-bold text-slate-900">
          Move details
        </Text>

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

        {renderProvincePicker(
          "Moving to",
          destProvince,
          showDestPicker,
          () => {
            setShowDestPicker(!showDestPicker);
            setShowOriginPicker(false);
          },
          setDestProvince,
        )}

        {/* Move date */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-slate-700">
            Move date
          </Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
            activeOpacity={0.7}
          >
            <Text
              className={`text-base ${moveDate ? "text-slate-900" : "text-slate-400"}`}
            >
              {moveDate
                ? moveDate.toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "Select date…"}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={moveDate ?? new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
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
              Adds licence & registration tasks
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
        <View className="mb-4 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <View className="flex-1">
            <Text className="text-base font-medium text-slate-900">
              Moving with kids?
            </Text>
            <Text className="text-sm text-slate-500">
              Adds school enrollment tasks
            </Text>
          </View>
          <Switch
            value={hasDependents}
            onValueChange={setHasDependents}
            trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
            thumbColor={hasDependents ? "#2563eb" : "#f1f5f9"}
          />
        </View>

        <TouchableOpacity
          onPress={handleSaveProfile}
          disabled={saveProfileMutation.isPending}
          className={`items-center rounded-xl py-3.5 ${
            saveProfileMutation.isPending ? "bg-blue-400" : "bg-blue-600"
          }`}
          activeOpacity={0.8}
        >
          {saveProfileMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-bold text-white">
              Save Move Details
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Personal info — device only */}
      <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <Text className="text-lg font-bold text-slate-900">
          Personal info
        </Text>
        <View className="mb-4 mt-1 flex-row items-center">
          <Ionicons
            name={"lock-closed" as IconName}
            size={13}
            color="#16a34a"
          />
          <Text className="ml-1 flex-1 text-xs text-green-700">
            Stored only on this device — never uploaded to our servers.
          </Text>
        </View>

        {PII_FIELDS.map((field) => (
          <View key={field.key} className="mb-4">
            <Text className="mb-1 text-sm font-medium text-slate-700">
              {field.label}
            </Text>
            <TextInput
              value={piiValues[field.key]}
              onChangeText={(text) =>
                setPiiValues((prev) => ({ ...prev, [field.key]: text }))
              }
              placeholder={field.placeholder}
              placeholderTextColor="#94a3b8"
              secureTextEntry={field.sensitive}
              autoCapitalize={field.key === "FULL_NAME" ? "words" : "none"}
              autoCorrect={false}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900"
            />
          </View>
        ))}

        <TouchableOpacity
          onPress={handleSavePII}
          disabled={savingPII}
          className={`items-center rounded-xl py-3.5 ${
            savingPII ? "bg-blue-400" : "bg-blue-600"
          }`}
          activeOpacity={0.8}
        >
          {savingPII ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base font-bold text-white">
              Save On Device
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Account */}
      <View className="rounded-xl border border-slate-200 bg-white p-4">
        <Text className="mb-3 text-lg font-bold text-slate-900">Account</Text>

        <TouchableOpacity
          onPress={handleSignOut}
          className="mb-3 flex-row items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-3.5"
          activeOpacity={0.7}
        >
          <Ionicons
            name={"log-out-outline" as IconName}
            size={18}
            color="#475569"
          />
          <Text className="ml-1.5 text-base font-semibold text-slate-700">
            Sign Out
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
          className={`flex-row items-center justify-center rounded-xl border py-3.5 ${
            deletingAccount
              ? "border-slate-200 bg-slate-50"
              : "border-red-200 bg-red-50"
          }`}
          activeOpacity={0.7}
        >
          {deletingAccount ? (
            <ActivityIndicator size="small" color="#b91c1c" />
          ) : (
            <>
              <Ionicons
                name={"trash-outline" as IconName}
                size={18}
                color="#b91c1c"
              />
              <Text className="ml-1.5 text-base font-semibold text-red-700">
                Delete My Data
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text className="mt-2 text-xs leading-4 text-slate-400">
          Deleting removes your account, checklist progress, and all personal
          info stored on this device. (PIPEDA right to erasure.)
        </Text>
      </View>
    </ScrollView>
  );
}
