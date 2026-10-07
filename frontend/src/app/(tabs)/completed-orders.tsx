import { OrdersScreen } from "@/screens/OrdersScreen";
import { useAuth } from "@/navigation/AppProvider";
import { PackerCompletedScreen } from "@/screens/PackerCompletedScreen";

export default function Route() {
  const { picker } = useAuth();
  return picker?.role === "PACKER" ? <PackerCompletedScreen /> : <OrdersScreen completed />;
}
