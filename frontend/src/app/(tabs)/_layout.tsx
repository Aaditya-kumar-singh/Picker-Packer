import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";
import { theme } from "@/components/ui";
import { BrandHeader } from "@/components/BrandHeader";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(activeName: IconName, inactiveName: IconName) {
  return ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? activeName : inactiveName} color={color} size={size} />
  );
}

export default function TabLayout() {
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const isPacker = picker?.role === "PACKER";
  const isPicker = picker?.role === "PICKER";

  const baseTabHeight = 62;
  const bottomInset = Math.max(insets.bottom, 0);
  const rolePrimary = isPacker ? theme.packer.primary : theme.picker.primary;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <BrandHeader />,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: rolePrimary,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.line,
          borderTopWidth: 1,
          height: baseTabHeight + bottomInset,
          paddingTop: 6,
          paddingBottom: 6 + bottomInset,
          shadowColor: theme.color.ink,
          shadowOpacity: 0.05,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: -2 },
          elevation: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
        tabBarItemStyle: {
          minHeight: 48,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: tabIcon("home", "home-outline"),
          href: isPicker ? "/dashboard" : null,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarLabel: "Orders",
          tabBarIcon: tabIcon("list", "list-outline"),
          href: isPicker ? "/orders" : null,
        }}
      />
      <Tabs.Screen
        name="packer-dashboard"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: tabIcon("home", "home-outline"),
          href: isPacker ? "/packer-dashboard" : null,
        }}
      />
      <Tabs.Screen
        name="completed-orders"
        options={{
          title: "Completed",
          tabBarLabel: "Completed",
          tabBarIcon: tabIcon("checkmark-done", "checkmark-done-outline"),
          href: isPicker || isPacker ? "/completed-orders" : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: tabIcon("person", "person-outline"),
          href: picker ? "/profile" : null,
        }}
      />
    </Tabs>
  );
}
