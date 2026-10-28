import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/navigation/AppProvider";
import { theme } from "@/components/ui";
import { BrandHeader } from "@/components/BrandHeader";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(activeName: IconName, inactiveName: IconName) {
  return ({ focused, color, size }: { focused: boolean; color: ColorValue | null; size: number }) => (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <Ionicons name={focused ? activeName : inactiveName} color={typeof color === "string" ? color : "#64748B"} size={size} />
    </View>
  );
}

function renderBrandHeader() {
  return <BrandHeader />;
}

export default function TabLayout() {
  const { picker } = useAuth();
  const insets = useSafeAreaInsets();
  const isPacker = picker?.role === "PACKER";
  const isPicker = picker?.role === "PICKER";

  const baseTabHeight = 64;
  const bottomInset = Math.max(insets.bottom, 0);
  const rolePrimary = isPacker ? "#D95D00" : "#0D6EFD";
  const roleActiveBg = isPacker ? "#FFF2E6" : "#E0EFFD";

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: renderBrandHeader,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: rolePrimary,
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopColor: "transparent",
          borderTopWidth: 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          overflow: "hidden",
          marginHorizontal: 8,
          height: baseTabHeight + bottomInset,
          paddingTop: 4,
          paddingBottom: Math.max(bottomInset, 6),
          paddingHorizontal: 8,
          shadowColor: theme.color.ink,
          shadowOpacity: 0.10,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
        tabBarBackground: () => <View style={s.tabBarBackground} />,
        tabBarLabelStyle: {
          fontFamily: "Poppins700",
          fontSize: 11,
          fontWeight: "normal",
          marginBottom: 2,
        },
        tabBarItemStyle: {
          height: 52,
          marginVertical: 2,
          marginHorizontal: 4,
          borderRadius: 14,
          overflow: "hidden",
        },
        tabBarActiveBackgroundColor: roleActiveBg,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
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
        name="packer-dashboard"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: tabIcon("home", "home-outline"),
          href: isPacker ? "/packer-dashboard" : null,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarLabel: "Orders",
          tabBarIcon: tabIcon("list", "list-outline"),
          href: isPicker || isPacker ? "/orders" : null,
        }}
      />
      <Tabs.Screen
        name="completed-orders"
        options={{
          title: "History",
          tabBarLabel: "History",
          tabBarIcon: tabIcon("time", "time-outline"),
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

const s = StyleSheet.create({
  tabBarBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    transform: [{ scale: 1.03 }],
  },
});
