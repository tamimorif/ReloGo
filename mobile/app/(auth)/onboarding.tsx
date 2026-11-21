/**
 * Onboarding screen.
 *
 * Collects the user's route and optional checklist preferences.
 * Route details, answers, and task progress are stored on this device.
 */
import { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { MovePreferences } from "@/components/MovePreferences";
import { shouldUseDarkAuthStatusBar } from "@/lib/authStatusBar";
import { useJourney } from "@/app/_layout";
import { saveLocalJourney } from "@/lib/localJourney";
import {
  CURRENT_CONSENT_VERSION,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "@/lib/legalConsent";
import {
  PROVINCES,
  PROVINCE_LABELS,
  type Province,
} from "@/types/database";

export default function OnboardingScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const { setJourney } = useJourney();

  const [hasVehicle, setHasVehicle] = useState<boolean | null>(null);
  const [hasSchoolAgeChildren, setHasSchoolAgeChildren] =
    useState<boolean | null>(null);
  const [originCity, setOriginCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");

  const [originProvince, setOriginProvince] = useState<Province | null>(null);
  const [destinationProvince, setDestinationProvince] =
    useState<Province | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHeaderPastStatusBar, setIsHeaderPastStatusBar] = useState(false);
  const headerHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);

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

  // Province picker state
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);

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
    if (!originCity.trim() || !destinationCity.trim()) {
      Alert.alert("Missing city", "Enter the city you are moving from and to.");
      return;
    }
    if (originProvince === destinationProvince) {
      Alert.alert(
        "Same jurisdiction",
        "Origin and destination must be different provinces or territories.",
      );
      return;
    }
    if (!hasConsented) {
      Alert.alert(
        "Consent Required",
        "Please agree to the Privacy Policy and Terms of Service to continue.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const journey = {
        originCity: originCity.trim(),
        originProvince,
        destinationCity: destinationCity.trim(),
        destinationProvince,
        hasVehicle,
        hasSchoolAgeChildren,
        consentVersion: CURRENT_CONSENT_VERSION,
      };
      await saveLocalJourney(journey);
      setJourney(journey);
      router.replace("/(tabs)/checklist");
    } catch {
      Alert.alert(
        "Couldn't finish setup",
        "Couldn't save your checklist on this device. Please try again.",
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
    <View className="flex-1 bg-slate-50">
      <StatusBar style={isHeaderPastStatusBar ? "dark" : "light"} />
      <ScrollView
        className="flex-1 bg-slate-50"
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) =>
          updateHeaderStatusBarStyle(event.nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View
          className="bg-blue-600 px-6 pb-8 pt-16"
          onLayout={(event) =>
            updateHeaderStatusBarStyle(
              scrollOffsetRef.current,
              event.nativeEvent.layout.height,
            )
          }
        >
          <Text className="text-3xl font-bold text-white">🇨🇦 ReloGo</Text>
          <Text className="mt-2 text-base text-blue-100">
            Your Canadian move guide. Tell us about your move and we'll build your
            personalised checklist.
          </Text>
        </View>

        {/* Form */}
        <View className="px-6 pt-6">
          <Text className="mb-3 text-base font-semibold text-slate-900">
            Your route
          </Text>
          <Text className="mb-1 text-sm font-medium text-slate-700">
            Moving from city
          </Text>
          <TextInput
            value={originCity}
            onChangeText={setOriginCity}
            placeholder="e.g. Toronto"
            placeholderTextColor="#94a3b8"
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="City you are moving from"
            className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900"
          />
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

          <Text className="mb-1 text-sm font-medium text-slate-700">
            Moving to city
          </Text>
          <TextInput
            value={destinationCity}
            onChangeText={setDestinationCity}
            placeholder="e.g. Vancouver"
            placeholderTextColor="#94a3b8"
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="City you are moving to"
            className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900"
          />
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

          <MovePreferences
            hasVehicle={hasVehicle}
            hasSchoolAgeChildren={hasSchoolAgeChildren}
            onVehicleChange={setHasVehicle}
            onChildrenChange={setHasSchoolAgeChildren}
          />

          {/* Local checklist data stays on this device; support is server-backed. */}
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
              . Your route and checklist stay on this device. If you contact
              support, that conversation is sent to our support inbox so a
              person can reply.
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
