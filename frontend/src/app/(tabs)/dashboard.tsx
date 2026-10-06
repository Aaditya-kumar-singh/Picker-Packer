import { DashboardScreen } from "@/screens/DashboardScreen";
import { PackerDashboardScreen } from "@/screens/PackerDashboardScreen";
import { useAuth } from "@/navigation/AppProvider";
export default function Route() {
  const { picker } = useAuth();
  return picker?.role === "PACKER" ? <PackerDashboardScreen /> : <DashboardScreen />;
}
