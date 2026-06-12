/**
 * Auth group layout — wraps onboarding and any future auth screens.
 * Minimal: just passes through to child routes.
 */
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
