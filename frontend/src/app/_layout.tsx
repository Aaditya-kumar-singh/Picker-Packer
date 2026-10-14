import { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/navigation/AppProvider";
import { SyncProvider } from "@/sync/SyncContext";
import { theme } from "@/theme";

function RouteGuard() {
  const { picker, ready } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;

    const routeSegments = segments as unknown as string[];
    const root = routeSegments[0];
    const child = routeSegments[1];
    const inAuthFlow = root === "login" || root === "otp" || root === undefined;

    if (!picker) {
      if (!inAuthFlow) router.replace("/login" as never);
      return;
    }

    const role = (picker.role || "").toUpperCase();
    const isPacker = role.includes("PACKER");

    const pickerRoots = new Set(["dashboard", "orders", "order", "pick"]);
    const packerRoots = new Set(["packer-dashboard", "pack"]);

    // Routes inside the persistent tab group are role-gated by their child route.
    if (root === "(tabs)") {
      if (isPacker && (child === "dashboard" || child === "orders")) {
        router.replace("/packer-dashboard" as never);
      } else if (!isPacker && child === "packer-dashboard") {
        router.replace("/dashboard" as never);
      }
      return;
    }

    if (!isPacker && packerRoots.has(root ?? "")) {
      router.replace("/dashboard" as never);
      return;
    }

    if (isPacker && pickerRoots.has(root ?? "")) {
      router.replace("/packer-dashboard" as never);
    }
  }, [picker, ready, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <RouteGuard />
          <Stack
            screenOptions={{
              headerShown: true,
              headerStyle: { backgroundColor: theme.color.surface },
              headerTintColor: theme.color.primaryContainer,
              headerTitleStyle: { fontWeight: "700", fontSize: 16 },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="otp" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

            <Stack.Screen name="order/[id]" options={{ title: "Picking Order" }} />
            <Stack.Screen name="pick/[orderId]/location" options={{ title: "Location Scan" }} />
            <Stack.Screen name="pick/[orderId]/sku" options={{ title: "SKU Scan" }} />
            <Stack.Screen name="pick/[orderId]/quantity" options={{ title: "Quantity" }} />
            <Stack.Screen name="pick/[orderId]/exception" options={{ title: "Exception" }} />
            <Stack.Screen name="pick/[orderId]/complete" options={{ title: "Completion" }} />

            <Stack.Screen name="pack/order/[id]" options={{ title: "Packing Order" }} />
            <Stack.Screen name="dispatch" options={{ title: "Dispatch Hub" }} />
          </Stack>
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
