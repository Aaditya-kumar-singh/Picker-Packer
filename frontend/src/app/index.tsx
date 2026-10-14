import { useEffect } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/navigation/AppProvider";

export default function Index() {
  const { picker, ready } = useAuth();
  useEffect(() => {
    if (!ready) return;
    const isPacker = (picker?.role || "").toUpperCase().includes("PACKER");
    router.replace((picker ? (isPacker ? "/packer-dashboard" : "/dashboard") : "/login") as never);
  }, [picker, ready]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>YBM Picker…</Text>
    </View>
  );
}
