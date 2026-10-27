import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/navigation/AppProvider";

export default function TabsIndex() {
  const { picker, ready } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#0D6EFD" />
      </View>
    );
  }

  return <Redirect href={picker?.role === "PACKER" ? "/packer-dashboard" : picker ? "/dashboard" : "/login"} />;
}
