// Persistent lightweight sync indicator + offline banner.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
          ? `OFFLINE${status.pending > 0 ? ` � QUEUED: ${status.pending}` : ""}`
          : status.connectivity === "SERVER_UNREACHABLE"
            ? "SERVER UNREACHABLE"
            : status.pending > 0
              ? `QUEUED: ${status.pending}`
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
  const text =
    status.connectivity !== "ONLINE"
      ? `Working offline — ${status.pending} event(s) queued for sync. Nothing is sent to WMS from this device.`
      : `${status.pending} event(s) queued — tap SYNC to upload.`;
  return (
    <View style={s.banner}>
      <Text style={s.bannerText}>◌ {text}</Text>
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
      <Text style={s.conflictsTitle}>! Sync conflicts ({status.conflicts.length}) — see your supervisor to resolve</Text>
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
        style={[s.retry, syncing && s.retryDisabled]}
      >
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
    borderLeftWidth: 4,
    borderLeftColor: theme.color.warnInk,
  },
  bannerText: { ...(theme.type.bodyMd as object), color: theme.color.warnInk, fontWeight: "600" },
  conflicts: {
    borderWidth: 1,
    borderColor: theme.color.warnInk,
    borderRadius: theme.radius.lg,
    padding: theme.space.sm,
    marginTop: theme.space.xs,
    backgroundColor: theme.color.warnBg,
  },
  conflictsTitle: { ...(theme.type.labelLg as object), color: theme.color.warnInk },
  conflict: { marginTop: theme.space.xs, borderTopWidth: 1, borderTopColor: theme.color.tertiaryFixedDim, paddingTop: theme.space.xs },
  conflictId: { ...(theme.type.codeMd as object), color: theme.color.ink },
  conflictMsg: { ...(theme.type.secondary as object), color: theme.color.warnInk, marginTop: 2 },
  retry: {
    marginTop: theme.space.xs,
    borderWidth: 2,
    borderColor: theme.color.warnInk,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.space.sm,
    minHeight: theme.touch.min,
    justifyContent: "center",
    alignItems: "center",
  },
  retryDisabled: { opacity: 0.45 },
  retryText: { ...(theme.type.button as object), color: theme.color.warnInk },
});
