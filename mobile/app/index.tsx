/**
 * Entry redirect.
 * The root layout handles the actual redirect logic;
 * this screen is a fallback loading state.
 */
import { View, ActivityIndicator, Text } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <ActivityIndicator size="large" color="#2563EB" />
      <Text className="mt-4 text-base text-slate-500">Loading ReloGo…</Text>
    </View>
  );
}
