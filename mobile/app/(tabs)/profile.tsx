import { useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { MovePreferences } from "@/components/MovePreferences";
import { useJourney } from "@/app/_layout";
import { TASK_PROGRESS_QUERY_KEY } from "@/lib/checklistQueries";
import { clearLocalJourney, saveLocalJourney, type LocalJourney } from "@/lib/localJourney";
import { PROVINCES, PROVINCE_LABELS, type Province } from "@/types/database";

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { journey, setJourney } = useJourney();
  const [draft, setDraft] = useState<Partial<LocalJourney> | null>(null);
  const [picker, setPicker] = useState<"origin" | "destination" | null>(null);
  const originCity = draft?.originCity ?? journey?.originCity ?? "";
  const destinationCity = draft?.destinationCity ?? journey?.destinationCity ?? "";
  const originProvince = draft?.originProvince ?? journey?.originProvince ?? null;
  const destinationProvince = draft?.destinationProvince ?? journey?.destinationProvince ?? null;
  const hasVehicle = draft && "hasVehicle" in draft
    ? draft.hasVehicle ?? null
    : journey?.hasVehicle ?? null;
  const hasSchoolAgeChildren = draft && "hasSchoolAgeChildren" in draft
    ? draft.hasSchoolAgeChildren ?? null
    : journey?.hasSchoolAgeChildren ?? null;

  function updateDraft<K extends keyof LocalJourney>(key: K, value: LocalJourney[K]) {
    setDraft((current) => ({ ...(current ?? {}), [key]: value }));
  }

  async function saveMoveDetails() {
    if (
      !journey ||
      !originProvince ||
      !destinationProvince ||
      !originCity.trim() ||
      !destinationCity.trim()
    ) {
      Alert.alert(
        "Missing move details",
        "Enter both cities and choose both provinces.",
      );
      return;
    }
    if (originProvince === destinationProvince) {
      Alert.alert(
        "Same jurisdiction",
        "Choose a different destination province or territory.",
      );
      return;
    }

    const updated = {
      ...journey,
      hasVehicle,
      hasSchoolAgeChildren,
      originCity: originCity.trim(),
      destinationCity: destinationCity.trim(),
      originProvince,
      destinationProvince,
    };
    try {
      await saveLocalJourney(updated);
      setJourney(updated);
      setDraft(null);
      Alert.alert(
        "Saved on this device",
        "Your checklist details stay on this phone.",
      );
    } catch {
      Alert.alert(
        "Couldn't save",
        "Please try again. Your checklist has not been changed.",
      );
    }
  }

  function renderProvincePicker(
    label: string,
    value: Province | null,
    key: "origin" | "destination",
  ) {
    return (
      <View className="mb-4">
        <Text className="mb-1 text-sm font-medium text-slate-700">{label}</Text>
        <TouchableOpacity
          onPress={() => setPicker(picker === key ? null : key)}
          className="min-h-12 justify-center rounded-xl border border-slate-200 bg-white px-4 py-3"
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${
            value ? PROVINCE_LABELS[value] : "Choose a province"
          }`}
        >
          <Text
            className={`text-base ${value ? "text-slate-900" : "text-slate-400"}`}
          >
            {value ? PROVINCE_LABELS[value] : "Choose province or territory"}
          </Text>
        </TouchableOpacity>
        {picker === key && (
          <View className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
            {PROVINCES.map((province) => (
              <TouchableOpacity
                key={province}
                onPress={() => {
                  updateDraft(key === "origin" ? "originProvince" : "destinationProvince", province);
                  setPicker(null);
                }}
                className={`rounded-lg px-3 py-2.5 ${
                  value === province ? "bg-blue-50" : ""
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: value === province }}
              >
                <Text
                  className={
                    value === province
                      ? "font-semibold text-blue-700"
                      : "text-slate-700"
                  }
                >
                  {PROVINCE_LABELS[province]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  async function resetThisDevice() {
    Alert.alert(
      "Reset this checklist?",
      "This clears your route and checkmarks from this phone. " +
        "Support conversations are separate and remain available to the support team.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset checklist",
          style: "destructive",
          onPress: async () => {
            try {
              await clearLocalJourney();
              queryClient.removeQueries({
                queryKey: TASK_PROGRESS_QUERY_KEY,
              });
              setJourney(null);
              router.replace("/(auth)/onboarding");
            } catch {
              Alert.alert("Couldn't reset", "Please try again.");
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-4 rounded-2xl border border-slate-100 bg-white p-5">
        <Text className="text-xl font-bold text-slate-900">Your move</Text>
        <Text className="mb-5 mt-1 text-sm leading-5 text-slate-500">
          City and province details are saved only on this device. Task rules
          use province codes.
        </Text>

        <Text className="mb-1 text-sm font-medium text-slate-700">
          Moving from city
        </Text>
        <TextInput
          value={originCity}
          onChangeText={(value) => updateDraft("originCity", value)}
          placeholder="e.g. Toronto"
          autoCapitalize="words"
          className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900"
        />
        {renderProvincePicker(
          "Origin province or territory",
          originProvince,
          "origin",
        )}

        <Text className="mb-1 text-sm font-medium text-slate-700">
          Moving to city
        </Text>
        <TextInput
          value={destinationCity}
          onChangeText={(value) => updateDraft("destinationCity", value)}
          placeholder="e.g. Vancouver"
          autoCapitalize="words"
          className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900"
        />
        {renderProvincePicker(
          "Destination province or territory",
          destinationProvince,
          "destination",
        )}

        <MovePreferences
          hasVehicle={hasVehicle}
          hasSchoolAgeChildren={hasSchoolAgeChildren}
          onVehicleChange={(value) => updateDraft("hasVehicle", value)}
          onChildrenChange={(value) => updateDraft("hasSchoolAgeChildren", value)}
        />

        <TouchableOpacity
          onPress={saveMoveDetails}
          className="mt-3 min-h-12 items-center justify-center rounded-xl bg-blue-600 px-4 py-3"
        >
          <Text className="font-bold text-white">Save move details</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => router.push("/(tabs)/contact")}
        className="mb-3 min-h-12 flex-row items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3"
      >
        <Ionicons name="chatbubbles-outline" size={18} color="#2563eb" />
        <Text className="ml-2 font-semibold text-slate-800">Human support</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={resetThisDevice}
        className="min-h-12 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-3"
      >
        <Text className="font-semibold text-red-700">Clear this device's checklist</Text>
      </TouchableOpacity>
      <Text className="mt-2 text-center text-xs leading-4 text-slate-500">
        No name, email, or home address is needed. Support messages are stored so a person can reply.
      </Text>
    </ScrollView>
  );
}
