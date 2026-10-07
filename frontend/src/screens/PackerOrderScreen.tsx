import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  ErrorBanner,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
  theme,
} from "@/components/ui";
import { newIdemKey } from "@/repositories/pickerRepository";
import * as client from "@/api/client";
import BarcodeDisplay from "@/components/BarcodeDisplay";

type Condition = "GOOD" | "DAMAGED" | "OTHER";

export function PackerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<client.OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [packQty, setPackQty] = useState<Record<string, string>>({});
  const [productType, setProductType] = useState<Record<string, string>>({});
  const [productBarcode, setProductBarcode] = useState<Record<string, string>>({});
  const [productConfirmed, setProductConfirmed] = useState<Record<string, boolean>>({});
  const [condition, setCondition] = useState<Record<string, Condition>>({});

  const load = useCallback(async () => {
    try {
      setOrder((await client.packerOrder(String(id))).order);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function start() {
    setBusy("start");
    setError(null);
    try {
      await client.packerStart(String(id), newIdemKey());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start packing");
    } finally {
      setBusy(null);
    }
  }

  function verifyProduct(item: client.OrderItem) {
    setProductConfirmed(prev => ({ ...prev, [item.id]: true }));
    setProductType(prev => ({ ...prev, [item.id]: prev[item.id] ?? item.productType }));
    setProductBarcode(prev => ({ ...prev, [item.id]: prev[item.id] ?? "" }));
    setError(null);
  }

  async function confirmItem(item: client.OrderItem) {
    const remaining = item.pickedQty - item.packedQty;
    const requested = Number(packQty[item.id] ?? remaining);
    const type = (productType[item.id] ?? "").trim();
    const barcode = (productBarcode[item.id] ?? "").trim();
    const itemCondition = condition[item.id] ?? "GOOD";

    if (!productConfirmed[item.id]) {
      setError("Confirm the product identity before packing the item.");
      return;
    }
    if (!type) {
      setError("Enter the product type.");
      return;
    }
    if (!barcode) {
      setError("Scan or enter the product barcode.");
      return;
    }
    if (remaining <= 0) return;
    if (!Number.isInteger(requested) || requested <= 0 || requested > remaining) {
      setError(`Pack quantity must be between 1 and ${remaining}`);
      return;
    }

    setBusy(item.id);
    setError(null);
    try {
      await client.confirmPackItem(
        String(id),
        item.id,
        item.productName,
        type,
        barcode,
        requested,
        itemCondition,
        newIdemKey(),
      );
      setProductConfirmed(prev => ({ ...prev, [item.id]: false }));
      setProductBarcode(prev => ({ ...prev, [item.id]: "" }));
      setPackQty(prev => ({ ...prev, [item.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm packing");
    } finally {
      setBusy(null);
    }
  }

  async function createPackage() {
    setBusy("package");
    setError(null);
    try {
      await client.createPackage(String(id), "STANDARD", undefined, null, newIdemKey());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create package");
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy("complete");
    setError(null);
    try {
      await client.packerComplete(String(id), newIdemKey());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete packing");
    } finally {
      setBusy(null);
    }
  }

  if (!order) {
    return (
      <Screen>
        <AppHeader title="Packing order" />
        <ErrorBanner message={error} />
        <LoadingState label="Loading order…" />
      </Screen>
    );
  }

  const packed = order.items.reduce((n, i) => n + i.packedQty, 0);
  const picked = order.items.reduce((n, i) => n + i.pickedQty, 0);
  const remaining = picked - packed;
  const canComplete =
    order.status === "PACKING" &&
    remaining === 0 &&
    order.packages.length > 0;

  return (
    <Screen>
      <AppHeader title={order.id} sub={order.customer} />
      <ErrorBanner message={error} />

      <View style={s.grid}>
        <View style={s.cell}><MetricCard value={String(picked)} label="Picked units" /></View>
        <View style={s.cell}><MetricCard value={String(packed)} label="Packed units" tone={remaining ? "warn" : "ok"} /></View>
        <View style={s.cell}><MetricCard value={String(order.packingConfirmations.length)} label="Verified items" /></View>
      </View>

      <StatusBadge text={order.status} tone={order.status === "PACKING" ? "warn" : "info"} />

      {order.status === "READY_FOR_PACKING" ? (
        <PrimaryButton
          label={busy === "start" ? "Starting…" : "START PACKING"}
          onPress={() => void start()}
          disabled={busy !== null}
        />
      ) : null}

      {order.status === "PACKING"
        ? order.items.map(item => {
            const left = item.pickedQty - item.packedQty;
            const verified = productConfirmed[item.id] === true;
            const itemCondition = condition[item.id] ?? "GOOD";

            return (
              <View key={item.id} style={s.item}>
                <View style={s.row}>
                  <Text style={s.sku}>{item.sku}</Text>
                  <Text style={s.qty}>{item.packedQty}/{item.pickedQty}</Text>
                </View>

                <Text style={s.name}>{item.productName}</Text>
                <Text style={s.specs}>{item.productSpecs || "No additional specifications"}</Text>

                <View style={s.verifyCard}>
                  <Text style={s.sectionTitle}>PRODUCT VERIFICATION</Text>
                  <Text style={s.label}>Expected product</Text>
                  <Text style={s.value}>{item.productName}</Text>
                  <Text style={s.label}>Expected type</Text>
                  <Text style={s.value}>{item.productType}</Text>
                  <BarcodeDisplay
                    label="EXPECTED PRODUCT BARCODE"
                    value={item.skuBarcode}
                    scanTitle="Scan product barcode"
                    inputValue={productBarcode[item.id] ?? ""}
                    onInputChange={value => setProductBarcode(prev => ({ ...prev, [item.id]: value }))}
                    inputPlaceholder="Type or scan product barcode"
                    match={
                      (productBarcode[item.id] ?? "").trim()
                        ? (productBarcode[item.id] ?? "").trim().toUpperCase() === item.skuBarcode.trim().toUpperCase()
                        : null
                    }
                    onScanned={(value) => setProductBarcode(prev => ({ ...prev, [item.id]: value }))}
                    disabled={busy !== null}
                  />

                  {!verified ? (
                    <PrimaryButton
                      label="CONFIRM PRODUCT"
                      onPress={() => verifyProduct(item)}
                      disabled={busy !== null || left <= 0}
                    />
                  ) : (
                    <>
                      <Text style={s.confirmed}>Product identity confirmed</Text>

                      <TextInput
                        value={productType[item.id] ?? ""}
                        onChangeText={v => setProductType(prev => ({ ...prev, [item.id]: v }))}
                        placeholder="Enter product type"
                        editable={busy === null}
                        style={s.input}
                      />

                      <TextInput
                        value={packQty[item.id] ?? String(left)}
                        onChangeText={v => setPackQty(prev => ({ ...prev, [item.id]: v }))}
                        keyboardType="numeric"
                        placeholder="Confirmed quantity"
                        editable={busy === null}
                        style={s.input}
                      />

                      <Text style={s.label}>Condition</Text>
                      <View style={s.conditionRow}>
                        {(["GOOD", "DAMAGED", "OTHER"] as Condition[]).map(value => (
                          <Pressable
                            key={value}
                            onPress={() => setCondition(prev => ({ ...prev, [item.id]: value }))}
                            style={[s.condition, itemCondition === value && s.conditionActive]}
                          >
                            <Text style={s.conditionText}>{value}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <PrimaryButton
                        label={busy === item.id ? "Confirming…" : "CONFIRM ITEM & PACK"}
                        onPress={() => void confirmItem(item)}
                        disabled={busy !== null || left <= 0}
                      />
                    </>
                  )}
                </View>

                {left <= 0 ? <Text style={s.done}>Item fully packed and confirmed</Text> : null}
              </View>
            );
          })
        : null}

      {order.status === "PACKING" ? (
        <PrimaryButton
          label={busy === "package" ? "Creating…" : "CREATE STANDARD PACKAGE"}
          onPress={() => void createPackage()}
          disabled={busy !== null || remaining !== 0}
        />
      ) : null}

      {order.status === "PACKING" ? (
        <PrimaryButton
          label={busy === "complete" ? "Completing…" : "COMPLETE PACKING"}
          onPress={() => void complete()}
          disabled={!canComplete || busy !== null}
        />
      ) : null}

      {order.status === "PACKED" || order.status === "RIDER_ASSIGNED" ? (
        <PrimaryButton label="Go to dispatch" onPress={() => router.push("/dispatch" as never)} />
      ) : null}

      <SecondaryButton label="Back to packing queue" onPress={() => router.back()} />
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", gap: theme.space.xs, marginVertical: theme.space.sm },
  cell: { flex: 1 },
  item: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  sku: { ...(theme.type.codeMd as object), color: theme.color.ink },
  qty: { ...(theme.type.labelMd as object), color: theme.color.primary },
  name: { ...(theme.type.body as object), color: theme.color.muted, marginBottom: theme.space.xs },
  specs: { ...(theme.type.secondary as object), color: theme.color.secondary, marginBottom: theme.space.xs },
  verifyCard: {
    backgroundColor: theme.color.surfaceContainerLow,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
  },
  sectionTitle: { ...(theme.type.labelMd as object), color: theme.color.primaryContainer, marginBottom: theme.space.xs },
  label: { ...(theme.type.caption as object), color: theme.color.muted, marginTop: theme.space.xxs },
  value: { ...(theme.type.bodyMd as object), color: theme.color.ink, marginBottom: theme.space.xxs },
  confirmed: { ...(theme.type.labelMd as object), color: theme.color.primary, marginBottom: theme.space.xs },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    color: theme.color.ink,
    backgroundColor: theme.color.surface,
    marginBottom: theme.space.xs,
  },
  conditionRow: { flexDirection: "row", gap: theme.space.xs, marginVertical: theme.space.xs },
  condition: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space.xs,
    alignItems: "center",
  },
  conditionActive: { borderColor: theme.color.primary, backgroundColor: theme.color.surfaceContainerHigh },
  conditionText: { ...(theme.type.caption as object), color: theme.color.ink },
  done: { ...(theme.type.labelMd as object), color: theme.color.primary, marginTop: theme.space.xs },
});
