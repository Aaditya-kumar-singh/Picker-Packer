import { Redirect, useLocalSearchParams } from "expo-router";

export function LegacyPickRedirect() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={`/order/${orderId}`} />;
}
