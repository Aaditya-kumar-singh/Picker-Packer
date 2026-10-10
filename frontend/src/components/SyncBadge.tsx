// Persistent lightweight sync indicator + offline banner.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBadge, theme, type Tone } from "@/components/ui";
import { useSyncStatus } from "@/sync/SyncContext";

export function SyncBadge({ onPress }: { onPress?: () => void }) {
  const { status, syncNow } = useSyncStatus();
  const label =
    status.syncing
      ? "SYNCING"
      : status.connectivity === "CHECKING"
        ? "CHECKING"
        : status.connectivity === "OFFLINE"
          ? `OFFLINE${status.pending > 0 ? ` • ${status.pending} QUEUED` : ""}`
          : status.connectivity === "SERVER_UNREACHABLE"
            ? "SERVER UNREACHABLE"
            : status.pending > 0
              ? `${status.pending} QUEUED`
              : status.lastSyncAt
                ? "SYNCED"
                : "ONLINE";
  const tone: Tone =
    status.connectivity === "OFFLINE" || status.connectivity === "SERVER_UNREACHABLE"
      ? "bad"
      : status.connectivity === "CHECKING" || status.pending > 0
        ? "warn"
        : "ok";
  const tap = onPress ?? (() => void syncNow());
  return (
    <Pressable accessibilityRole="button" onPress={tap}>
      <View>
        <StatusBadge text={label} tone={tone} />
        {status.failed > 0 ? (
          <Text style={s.failed}>• {status.failed} need review</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function OfflineBanner() {
  const { status } = useSyncStatus();
  if (status.connectivity === "CHECKING" || (status.connectivity === "ONLINE" && status.pending === 0)) return null;
  const isOffline = status.connectivity !== "ONLINE";
  const text = isOffline
    ? `Working offline — ${status.pending} event(s) queued for sync.`
    : `${status.pending} event(s) queued — tap to upload.`;
  return (
    <View style={s.banner}>
      <Ionicons
        name={isOffline ? "cloud-offline-outline" : "cloud-upload-outline"}
        size={20}
        color={theme.color.warnInk}
      />
      <Text style={s.bannerText}>{text}</Text>
    </View>
  );
}

// Conflict detail (read-only): event id + server reason + current sync
// state. Resolution is supervisor-owned — the picker sees what happened
// and is told exactly where to get it resolved. No auto-resolve here.
export function ConflictList() {
  const { status, syncNow } = useSyncStatus();
  const [syncing, setSyncing] = useState(false);
  if (status.conflicts.length === 0) return null;
  async function retry() {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }
  return (
    <View style={s.conflicts}>
      <View style={s.conflictsHeader}>
        <Ionicons name="alert-circle" size={18} color={theme.color.badInk} />
        <Text style={s.conflictsTitle}>
          Sync conflicts ({status.conflicts.length}) — see supervisor to resolve
        </Text>
      </View>
      {status.conflicts.map((c) => (
        <View key={c.clientEventId} style={s.conflict}>
          <Text style={s.conflictId}>Event {c.clientEventId.slice(0, 8)}…</Text>
          <Text style={s.conflictMsg}>{c.message ?? "Server rejected this change"}</Text>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: syncing }}
        onPress={() => void retry()}
        disabled={syncing}
        style={({ pressed }) => [
          s.retry,
          syncing && s.retryDisabled,
          pressed && !syncing ? { opacity: 0.85 } : null,
        ]}
      >
        <Ionicons name="refresh" size={16} color={theme.color.warnInk} />
        <Text style={s.retryText}>{syncing ? "Retrying…" : "Retry sync"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  failed: { ...(theme.type.labelMd as object), color: theme.color.badInk, marginTop: 4 },
  banner: {
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    borderWidth: 1,
    borderColor: theme.color.warnBorder,
    borderLeftWidth: 4,
    borderLeftColor: theme.color.warnInk,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerText: {
    ...(theme.type.bodyMd as object),
    color: theme.color.warnInk,
    fontWeight: "600",
    flex: 1,
  },
  conflicts: {
    borderWidth: 1,
    borderColor: theme.color.badBorder,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginTop: theme.space.xs,
    backgroundColor: theme.color.badBg,
  },
  conflictsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  conflictsTitle: {
    ...(theme.type.labelLg as object),
    color: theme.color.badInk,
    flex: 1,
  },
  conflict: {
    marginTop: theme.space.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(220, 38, 38, 0.15)",
    paddingTop: theme.space.xs,
  },
  conflictId: { ...(theme.type.codeMd as object), color: theme.color.ink },
  conflictMsg: { ...(theme.type.secondary as object), color: theme.color.badInk, marginTop: 2 },
  retry: {
    marginTop: theme.space.sm,
    borderWidth: 1.5,
    borderColor: theme.color.warnInk,
    borderRadius: theme.radius.md,
    backgroundColor: "#ffffff",
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.md,
    minHeight: theme.touch.min,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  retryDisabled: { opacity: 0.45 },
  retryText: { ...(theme.type.button as object), color: theme.color.warnInk },
});
