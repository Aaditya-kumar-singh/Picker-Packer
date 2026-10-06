import { OrdersScreen } from "@/screens/OrdersScreen";
import { PackerDashboardScreen } from "@/screens/PackerDashboardScreen";
import { useAuth } from "@/navigation/AppProvider";
export default function Route() {
  const { picker } = useAuth();
  return picker?.role === "PACKER" ? <PackerDashboardScreen /> : <OrdersScreen />;
}
