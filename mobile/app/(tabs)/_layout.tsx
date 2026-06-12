/**
 * Bottom Tab Navigator layout for the main app.
 */
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 88,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
        headerStyle: {
          backgroundColor: "#2563EB",
        },
        headerTintColor: "#ffffff",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: 18,
        },
      }}
    >
      <Tabs.Screen
        name="checklist"
        options={{
          title: "Checklist",
          headerTitle: "My Relocation Checklist",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons
              name={"checkbox-outline" as IconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          headerTitle: "My Profile",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons
              name={"person-circle-outline" as IconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
