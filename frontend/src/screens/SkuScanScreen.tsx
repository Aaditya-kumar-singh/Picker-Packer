// Compact picker item step: verify the SKU and count each physical item barcode scan as 1 EA.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  ProgressIndicator,
  Screen,
  theme,
} from "@/components/ui";
import { formatItemLocation, isOrderFullyPicked, nextPendingLine } from "@/domain/order";
import { pickerAppApi } from "@/api/pickerAppApi";
import { alertWrongBarcode, beepSuccess } from "@/services/scanner";
import BarcodeDisplay from "@/components/BarcodeDisplay";
import type { FulfillmentOrderDto, FulfillmentOrderItemDto } from "@/types";

export function SkuScanScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const numOrderId = parseInt(String(orderId), 10);
  const [order, setOrder] = useState<FulfillmentOrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!Number.isSafeInteger(numOrderId) || numOrderId <= 0) {
        setOrder(null);
        setError("Invalid order ID. Return to the order list and select a valid order.");
        return;
      }
      const assigned = await pickerAppApi.getAssignedOrders();
      const validOrder = assigned.find((candidate) => candidate.orderId === numOrderId);
      if (!validOrder) {
        setOrder(null);
        setError("This order is not in your assigned picking queue. Return to the order list and refresh.");
        return;
      }
      const items = await pickerAppApi.getOrderItems(numOrderId);
      setOrder({ ...validOrder, items });
    } catch (err: any) {
      setOrder(null);
      setError(err?.message || "Failed to load order items.");
    } finally {
      setLoading(false);
    }
  }, [numOrderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const line = order ? nextPendingLine(order) : null;
  const isComplete = order ? isOrderFullyPicked(order) : false;

  useEffect(() => {
    if (!order) return;
    if (isComplete) {
      router.replace({ pathname: "/pick/[orderId]/complete", params: { orderId: String(order.orderId) } } as never);
    }
  }, [order, isComplete]);

  async function processItemBarcode(value: string) {
    if (!line || !order || busy) return;
    const barcode = value.trim();
    if (!barcode) {
      setManual("");
      const msg = "Scan or type the product barcode.";
      setError(msg);
      alertWrongBarcode("", line.sku, msg);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await pickerAppApi.scanOrderItem(order.orderId, barcode);

      if (res.success) {
        beepSuccess();
        setManual("");

        if (res.items) {
          setOrder((prev) => (prev ? { ...prev, items: res.items!, totalItemsScanned: res.totalItemsPicked ?? prev.totalItemsScanned } : null));
        }

        if (res.orderFullyPicked) {
          router.replace({ pathname: "/pick/[orderId]/complete", params: { orderId: String(order.orderId) } } as never);
        }
      } else {
        setManual("");
        setError(res.message);
        alertWrongBarcode(barcode, line.sku, res.message);
      }
    } catch (err: any) {
      setManual("");
      const msg = err?.message || "Scan error";
      setError(msg);
      alertWrongBarcode(barcode, line.sku, msg);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return (
      <Screen>
        <AppHeader title="Pick Product" sub="Loading item…" />
        <LoadingState label="Loading product…" />
      </Screen>
    );
  }

  if (!order || !line) {
    return (
      <Screen>
        <AppHeader title="Pick Complete" sub="All lines picked" />
        <View style={s.centerBox}>
          <Ionicons name="checkmark-done-circle" size={54} color={theme.color.okInk} />
          <Text style={s.centerTitle}>All Items Picked!</Text>
          <Text style={s.centerSub}>Ready for packing station hand-off.</Text>
          <Pressable
            style={s.btn}
            onPress={() => router.replace({ pathname: "/pick/[orderId]/complete", params: { orderId: String(numOrderId) } } as never)}
          >
            <Text style={s.btnText}>Assign Packer</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const loc = formatItemLocation(line);

  return (
    <Screen>
      <AppHeader
        title={order.orderNumber}
        sub={`Item: ${line.productName}`}
        showBack
      />

      <ProgressIndicator
        done={line.pickedQty}
        total={line.orderedQty}
      />

      <View style={s.itemCard}>
        <View style={s.locRow}>
          <Ionicons name="location" size={16} color="#D97706" />
          <Text style={s.locText}>{loc}</Text>
        </View>

        <Text style={s.productName}>{line.productName}</Text>
        {line.variantLabel ? <Text style={s.variantLabel}>{line.variantLabel}</Text> : null}
        <Text style={s.skuText}>SKU: {line.sku}</Text>

        <View style={s.qtyBox}>
          <Text style={s.qtyLabel}>QTY PICKED</Text>
          <Text style={s.qtyValue}>
            {line.pickedQty} / {line.orderedQty}
          </Text>
        </View>
      </View>

      <ErrorBanner message={error} />

      <BarcodeDisplay
        label="PRODUCT SKU / BARCODE"
        value={line.barcode || line.sku}
        scanTitle="Scan Product"
        inputValue={manual}
        onInputChange={setManual}
        onSubmit={() => void processItemBarcode(manual)}
        onScanned={(value) => {
          setManual(value);
          void processItemBarcode(value);
        }}
        disabled={busy}
        inputPlaceholder="Scan or type item barcode"
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginVertical: 12,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  locText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B45309",
  },
  productName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  variantLabel: {
    fontSize: 13,
    color: "#475569",
    marginTop: 2,
  },
  skuText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  qtyBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  qtyLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0D6EFD",
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    marginTop: 40,
  },
  centerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 12,
  },
  centerSub: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  btn: {
    marginTop: 20,
    backgroundColor: "#16A34A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
