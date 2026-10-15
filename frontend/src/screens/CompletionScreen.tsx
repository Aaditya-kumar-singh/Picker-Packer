// Picker Completion Screen — Assign Packer (PICKING → PACKING) per picker-app-api.md §2.3 & §2.6
import { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AppHeader,
  Card,
  ErrorBanner,
  LoadingState,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  StatusBadge,
  SuccessFeedback,
  theme,
} from "@/components/ui";
import { pickerAppApi } from "@/api/pickerAppApi";
import { resolvePhotoUrl } from "@/api/http";
import type { FulfillmentOrderDto, PackerCandidateDto } from "@/types";
import { getOrderProgress } from "@/utils/warehouse";

export function CompletionScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const numOrderId = parseInt(String(orderId), 10);
  const [order, setOrder] = useState<FulfillmentOrderDto | null>(null);
  const [packers, setPackers] = useState<PackerCandidateDto[]>([]);
  const [selectedPackerId, setSelectedPackerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failedPackerPhotos, setFailedPackerPhotos] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cached = pickerAppApi.getCachedOrder(numOrderId);
      if (cached) {
        setOrder(cached);
      } else {
        const orders = await pickerAppApi.getAssignedOrders();
        const found = orders.find((o) => o.orderId === numOrderId);
        if (found) setOrder(found);
      }

      const availablePackers = await pickerAppApi.getAvailablePackers();
      setPackers(availablePackers || []);
      if (availablePackers && availablePackers.length > 0) {
        setSelectedPackerId(availablePackers[0].id);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load order or available packers.");
    } finally {
      setLoading(false);
    }
  }, [numOrderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleAssignPacker() {
    if (!selectedPackerId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await pickerAppApi.assignPacker(numOrderId, selectedPackerId);
      setSuccessMsg(res || "Packer assigned successfully! Order moved to PACKING queue.");
      setTimeout(() => {
        router.replace("/orders" as never);
      }, 1500);
    } catch (e: any) {
      setError(e?.message || "Failed to assign packer.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return (
      <Screen>
        <AppHeader title="Assign Packer" sub="Loading available packers…" />
        <LoadingState label="Loading station assignment…" />
      </Screen>
    );
  }

  const prog = order ? getOrderProgress(order) : { pickedLines: 0, totalLines: 0, pct: 100 };

  return (
    <Screen contentContainerStyle={s.container}>
      <AppHeader
        title={order?.orderNumber || `Order #${orderId}`}
        sub="Assign Packer & Hand Off"
        showBack
      />

      <View style={s.hero}>
        <View style={s.iconBox}>
          <Ionicons name="checkmark-done-circle" size={36} color={theme.color.okInk} />
        </View>
        <Text style={s.title}>ALL ITEMS PICKED</Text>
        <Text style={s.subtitle}>
          Select an active packing operator in your warehouse to hand off this order.
        </Text>
      </View>

      <View style={s.grid}>
        <View style={s.cell}>
          <MetricCard value={String(prog.pickedLines)} label="Lines Picked" tone="ok" />
        </View>
        <View style={s.cell}>
          <MetricCard value={`${prog.totalLines}`} label="Total Lines" />
        </View>
        <View style={s.cell}>
          <MetricCard value="100%" label="Completed" tone="ok" />
        </View>
      </View>

      <Text style={s.sectionHeader}>AVAILABLE PACKERS IN WAREHOUSE</Text>

      {packers.length === 0 ? (
        <Card>
          <Text style={s.noPackersText}>
            No active packers currently found in this warehouse. Please contact your warehouse supervisor.
          </Text>
        </Card>
      ) : (
        <ScrollView style={s.packersList} showsVerticalScrollIndicator={false}>
          {packers.map((packer) => {
            const isSelected = selectedPackerId === packer.id;
            const photo = resolvePhotoUrl(packer.photoFilePath);

            return (
              <Pressable
                key={packer.id}
                onPress={() => setSelectedPackerId(packer.id)}
                style={[s.packerCard, isSelected && s.packerCardSelected]}
              >
                {photo && !failedPackerPhotos.includes(packer.id) ? (
                  <Image source={{ uri: photo }} style={s.packerPhoto} onError={() => setFailedPackerPhotos((ids) => ids.includes(packer.id) ? ids : [...ids, packer.id])} />
                ) : (
                  <View style={s.packerAvatar}>
                    <Text style={s.packerAvatarText}>
                      {(packer.name || "P").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={s.packerInfo}>
                  <Text style={s.packerName}>{packer.name}</Text>
                  <Text style={s.packerPhone}>{packer.phone}</Text>
                  {packer.rating ? (
                    <View style={s.ratingRow}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={s.ratingText}>{packer.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={[s.radioCircle, isSelected && s.radioCircleSelected]}>
                  {isSelected ? <View style={s.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ErrorBanner message={error} />
      {successMsg ? <SuccessFeedback message={successMsg} /> : null}

      <View style={s.actionStack}>
        <PrimaryButton
          label={busy ? "Assigning Packer…" : "ASSIGN PACKER & HAND OFF"}
          icon="paper-plane"
          variant="success"
          onPress={handleAssignPacker}
          disabled={busy || !selectedPackerId || Boolean(successMsg)}
        />
        <SecondaryButton
          label="Back to Order"
          icon="arrow-back"
          onPress={() => router.back()}
          disabled={busy || Boolean(successMsg)}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  hero: {
    alignItems: "center",
    marginVertical: theme.space.xs,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.color.okBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.space.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.color.ink,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: theme.color.muted,
    textAlign: "center",
    marginTop: 2,
    maxWidth: 320,
  },
  grid: {
    flexDirection: "row",
    gap: theme.space.xs,
    marginVertical: theme.space.sm,
  },
  cell: {
    flex: 1,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.color.muted,
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 8,
  },
  packersList: {
    maxHeight: 280,
  },
  packerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  packerCardSelected: {
    borderColor: "#0D6EFD",
    backgroundColor: "#EFF6FF",
  },
  packerPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  packerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D95D00",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  packerAvatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  packerInfo: {
    flex: 1,
  },
  packerName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  packerPhone: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: "#0D6EFD",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#0D6EFD",
  },
  noPackersText: {
    fontSize: 13,
    color: theme.color.muted,
    textAlign: "center",
    padding: 8,
  },
  actionStack: {
    marginTop: 14,
    gap: 8,
  },
});
