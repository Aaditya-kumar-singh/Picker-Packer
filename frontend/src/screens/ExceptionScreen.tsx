// Screen 9 — Exception. All 6 documented types. Line -> EXCEPTION, then next item.
// Photo evidence (online only): exception is created FIRST so a failed
// upload never loses the report; uploads retry against a fresh grant while
// abandoned PENDING rows are janitor-cleaned server-side.
import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Image, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AlertHeader,
  AppHeader,
  Chip,
  Divider,
  ErrorBanner,
  FieldInput,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionHeader,
  SuccessFeedback,
  theme,
} from "@/components/ui";
import { newIdemKey, pickerRepository } from "@/repositories/pickerRepository";
import { pickStepPath } from "@/domain/order";
import { useSyncStatus } from "@/sync/SyncContext";
import type { EvidenceItem, ExceptionType, Order } from "@/types";

const TYPES: ExceptionType[] = ["SHORT_PICK", "DAMAGED", "WRONG_ITEM", "LOCATION_EMPTY", "EXPIRED", "OTHER"];

// Reason codes per exception type. DAMAGED deliberately has no stock-shortage
// default — damage reasons describe the damage.
const REASONS: Record<ExceptionType, string[]> = {
  SHORT_PICK: ["INSUFFICIENT_STOCK", "PARTIAL_CASE", "NOT_FOUND_IN_LOCATION"],
  DAMAGED: ["CRUSHED", "TORN_PACKAGING", "WATER_DAMAGE", "OTHER_DAMAGE"],
  WRONG_ITEM: ["WRONG_SKU_IN_LOCATION", "MISLABELED"],
  LOCATION_EMPTY: ["EMPTY_BIN", "ZERO_ON_HAND"],
  EXPIRED: ["PAST_EXPIRY", "NEAR_EXPIRY"],
  OTHER: ["OTHER"],
};

interface LocalPhoto {
  uri: string;
  mimeType: string;
  fileSize: number | undefined;
}

async function uriToBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export function ExceptionScreen() {
  const { orderId, lineId } = useLocalSearchParams<{ orderId: string; lineId?: string }>();
  const { status: sync } = useSyncStatus();
  const [order, setOrder] = useState<Order | null>(null);
  const [type, setType] = useState<ExceptionType>("SHORT_PICK");
  const [reason, setReason] = useState(REASONS.SHORT_PICK[0]);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Photo flow state (set after the exception exists).
  const [exceptionId, setExceptionId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);

  const load = useCallback(async () => {
    const r = await pickerRepository.getOrder(String(orderId));
    if (r.ok) setOrder(r.data);
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Active-line context: explicit lineId (e.g. the short-picked line) wins;
  // otherwise the SKU-validated line being worked. Never fall back to an
  // untouched PENDING line — exceptions attach to work in progress.
  const line =
    order?.lines.find((l) => l.id === lineId) ??
    order?.lines.find((l) => l.status === "SKU_VALIDATED") ??
    order?.lines.find((l) => l.status === "LOCATION_VALIDATED") ??
    null;
  const shortage = line ? Math.max(0, line.requiredQty - line.pickedQty) : 0;
  const online = sync.connectivity === "ONLINE";

  function pickType(t: ExceptionType) {
    setType(t);
    setReason(REASONS[t][0]);
    if (t === "SHORT_PICK" && line && shortage > 0 && !qty) setQty(String(shortage));
  }

  async function submit() {
    if (!line || !order || busy) return;
    setBusy(true);
    setError(null);
    try {
      const q = type === "SHORT_PICK" && qty.trim() !== "" ? Number(qty) : null;
      if (q !== null && (!Number.isFinite(q) || q <= 0)) {
        setError("Shortage quantity must be greater than 0");
        return;
      }
      const r = await pickerRepository.createException(line.id, type, reason.trim(), q, note || null, newIdemKey());
      if (!r.ok) {
        setError(`${r.apiError.error}: ${r.apiError.message}`);
        return;
      }
      setExceptionId(r.data.id);
      void refreshEvidence(r.data.id);
    } finally {
      setBusy(false);
    }
  }

  async function refreshEvidence(id: string) {
    const r = await pickerRepository.listExceptionEvidence(id);
    if (r.ok) setEvidence(r.data);
  }

  async function capture(fromCamera: boolean) {
    setUploadError(null);
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setUploadError(fromCamera ? "Camera permission denied" : "Photo library permission denied");
        return;
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (res.canceled || res.assets.length === 0) return;
      const a = res.assets[0];
      const mimeType = a.mimeType === "image/png" ? "image/png" : "image/jpeg";
      setPhoto({ uri: a.uri, mimeType, fileSize: a.fileSize });
      setUploadState("idle");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not open camera");
    }
  }

  async function upload() {
    if (!photo || !exceptionId || uploadState === "uploading") return;
    setUploadState("uploading");
    setUploadError(null);
    let failed = true;
    try {
      const fileName = photo.uri.split("/").pop() ?? "evidence.jpg";
      const g = await pickerRepository.grantEvidenceUpload(exceptionId, fileName, photo.mimeType, photo.fileSize);
      if (!g.ok) {
        setUploadError(`${g.apiError.error}: ${g.apiError.message}`);
        return;
      }
      let bytes: Uint8Array;
      try {
        bytes = await uriToBytes(photo.uri);
      } catch {
        setUploadError("Could not read the photo. Try capturing again.");
        return;
      }
      if (bytes.length === 0) {
        setUploadError("Photo is empty. Try capturing again.");
        return;
      }
      const up = await pickerRepository.uploadEvidenceBytes(g.data.uploadUrl, bytes, photo.mimeType);
      if (!up.ok) {
        setUploadError(`${up.apiError.error}: ${up.apiError.message}`);
        return;
      }
      // Resolve the PENDING row minted by the grant, then confirm it.
      const list = await pickerRepository.listExceptionEvidence(exceptionId);
      const row = list.ok ? list.data.find((e) => e.objectKey === g.data.objectKey && e.status === "PENDING") : undefined;
      if (!row) {
        setUploadError("Upload reached storage but confirmation failed. Retry — the exception itself is saved.");
        return;
      }
      const done = await pickerRepository.completeEvidenceUpload(exceptionId, row.id);
      if (!done.ok) {
        setUploadError(`${done.apiError.error}: ${done.apiError.message}`);
        return;
      }
      failed = false;
      setPhoto(null);
      void refreshEvidence(exceptionId);
    } finally {
      setUploadState(failed ? "error" : "idle");
    }
  }

  // The exceptioned line is terminal, so resume at the next line's
  // authoritative step (or completion). Reload first: local order state is
  // stale after submit. Fall back to location only when reload fails.
  async function continuePicking() {
    const r = await pickerRepository.getOrder(String(orderId));
    if (r.ok) {
      setOrder(r.data);
      router.replace(pickStepPath(r.data.id, r.data) as never);
      return;
    }
    router.replace(`/pick/${orderId}/location` as never);
  }

  // ── Step 2: exception saved → photo evidence + continue ──────────────
  if (exceptionId && order) {
    const uploaded = evidence.filter((e) => e.status === "UPLOADED");
    const failed = evidence.filter((e) => e.status === "FAILED");
    return (
      <Screen>
        <AlertHeader title="Exception saved" sub={`${order.externalId} • Line ${line?.lineNo ?? "-"}`} />
        <SuccessFeedback message="Exception recorded. It is safe to leave — uploads can retry." />
        <SectionHeader title="Photo evidence" hint={type === "DAMAGED" ? "Recommended for damage" : "Optional"} />
        {!online ? (
          <ErrorBanner message="Photo upload needs a connection. The exception is saved — attach the photo when back online." />
        ) : null}
        {photo ? (
          <View style={s.previewBox}>
            <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="cover" />
            <SecondaryButton label="Remove photo" onPress={() => { setPhoto(null); setUploadState("idle"); setUploadError(null); }} />
          </View>
        ) : (
          <>
            <PrimaryButton label="Take photo" onPress={() => void capture(true)} disabled={!online} />
            <SecondaryButton label="Choose from library" onPress={() => void capture(false)} disabled={!online} />
          </>
        )}
        {photo && uploadState !== "uploading" ? (
          <PrimaryButton label="Upload photo" onPress={() => void upload()} disabled={!online} />
        ) : null}
        {uploadState === "uploading" ? <Text style={s.info}>Uploading…</Text> : null}
        <ErrorBanner message={uploadError} />
        {uploadState === "error" ? (
          <SecondaryButton label="Retry upload" onPress={() => void upload()} />
        ) : null}
        {uploaded.length > 0 ? <Text style={s.info}>Uploaded photos: {uploaded.length}</Text> : null}
        {failed.length > 0 ? <Text style={s.info}>Failed uploads: {failed.length} (abandoned rows are cleaned server-side)</Text> : null}
        <Divider />
        <PrimaryButton label="Continue picking" onPress={() => void continuePicking()} />
      </Screen>
    );
  }

  // ── Step 1: report the exception ─────────────────────────────────────
  return (
    <Screen>
      <AlertHeader title="Report Exception" sub={order ? `${order.externalId} • Line ${line?.lineNo ?? "—"}` : ""} />
      {!line ? (
        <>
          <ErrorBanner message="No active line to attach this exception to. Go back and scan a location first." />
          <SecondaryButton label="Back to picking" onPress={() => void continuePicking()} />
        </>
      ) : (
        <>
          <SectionHeader title="Exception type" />
          {TYPES.map((t) => (
            <Chip key={t} label={t} selected={type === t} onPress={() => pickType(t)} />
          ))}
          <SectionHeader title="Reason" />
          {REASONS[type].map((rc) => (
            <Chip key={rc} label={rc} selected={reason === rc} onPress={() => setReason(rc)} />
          ))}
          {type === "SHORT_PICK" ? (
            <>
              <SectionHeader title="Shortage" hint="Confirm the missing quantity" />
              <View style={s.grid}>
                <View style={s.cell}>
                  <MetricCard value={String(line.requiredQty)} label="Required" />
                </View>
                <View style={s.cell}>
                  <MetricCard value={String(line.pickedQty)} label="Picked" tone="info" />
                </View>
                <View style={s.cell}>
                  <MetricCard value={String(shortage)} label="Shortage" tone={shortage > 0 ? "warn" : "ok"} />
                </View>
              </View>
              <FieldInput
                label="Confirm shortage qty"
                value={qty}
                onChangeText={setQty}
                keyboardType="numeric"
                placeholder={String(shortage)}
                textAlign="center"
                returnKeyType="done"
              />
            </>
          ) : null}
          <FieldInput
            label="Note"
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            returnKeyType="done"
          />
          <ErrorBanner message={error} />
          <PrimaryButton label={busy ? "Saving…" : "Submit exception"} onPress={submit} disabled={busy} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 2 },
  cell: { width: "50%", paddingHorizontal: 4, flexGrow: 1 },
  info: { marginTop: theme.space.xs, ...(theme.type.bodyMd as object), color: theme.color.muted },
  previewBox: { marginTop: theme.space.xs },
  preview: { width: "100%", height: 220, borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceContainerLow },
});

