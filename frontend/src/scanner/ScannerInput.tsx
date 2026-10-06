import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { buildScanResult, ScanMethod, ScanResult } from "./parser";
import { theme } from "../theme";

type Props = {
  mode: "location" | "sku";
  onScanResult: (result: ScanResult) => void;
  disabled?: boolean;
};

export default function ScannerInput({ mode, onScanResult, disabled = false }: Props) {
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const inputRef = useRef<TextInput>(null);
  const [status, setStatus] = useState("Awaiting scan or input");

  const isLocation = mode === "location";

  useEffect(() => {
    if (!camera && !disabled) {
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [camera, disabled]);

  const submit = (raw: string, method: ScanMethod) => {
    const result = buildScanResult(raw, method);
    if (!result) {
      setStatus("Duplicate or invalid scan ignored");
      return;
    }
    setManual("");
    setStatus("Barcode captured successfully");
    onScanResult(result);
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setStatus("Camera permission denied. Use manual or hardware scan.");
        return;
      }
    }
    setCamera(true);
  };

  if (camera) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["code128", "code39", "ean13", "ean8", "qr"],
          }}
          onBarcodeScanned={({ data }) => submit(data, "camera")}
        />
        <View style={styles.reticle}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />
          <View style={styles.scanLaser} />
        </View>
        <View style={styles.cameraFooter}>
          <Text style={styles.cameraText}>
            Align {isLocation ? "location barcode" : "product SKU"} within target
          </Text>
          <TouchableOpacity style={styles.close} onPress={() => setCamera(false)} activeOpacity={0.8}>
            <Text style={styles.closeText}>Switch to Keyboard / Hardware</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.box, isLocation ? styles.boxLocation : styles.boxSku]}>
      <View style={styles.headerRow}>
        <View style={[styles.modeBadge, isLocation ? styles.badgeLocation : styles.badgeSku]}>
          <Text style={[styles.modeText, isLocation ? styles.textLocation : styles.textSku]}>
            {isLocation ? "📍 LOCATION SCAN" : "🏷️ SKU BARCODE SCAN"}
          </Text>
        </View>
        <Text style={styles.subtext}>Hardware ready</Text>
      </View>

      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder={isLocation ? "Scan or enter shelf: A-02-001" : "Scan or enter product SKU"}
        placeholderTextColor={theme.colors.textSubtle}
        value={manual}
        onChangeText={setManual}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!disabled}
        onSubmitEditing={() => submit(manual, "hardware")}
        returnKeyType="done"
        blurOnSubmit={false}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          disabled={disabled}
          style={[styles.cameraButton, disabled && styles.disabledButton]}
          onPress={openCamera}
          activeOpacity={0.8}
        >
          <Text style={styles.cameraButtonText}>📷 Open Camera Scanner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={disabled || !manual.trim()}
          style={[
            styles.manualButton,
            (!manual.trim() || disabled) && styles.disabledButton,
          ]}
          onPress={() => submit(manual, "manual")}
          activeOpacity={0.8}
        >
          <Text style={styles.manualButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    ...theme.shadows.sm,
  },
  boxLocation: {
    borderColor: theme.colors.location.border,
    backgroundColor: "#FFFDF5",
  },
  boxSku: {
    borderColor: theme.colors.sku.border,
    backgroundColor: "#FAF5FF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.xs,
  },
  modeBadge: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
  },
  badgeLocation: {
    backgroundColor: theme.colors.location.bg,
  },
  badgeSku: {
    backgroundColor: theme.colors.sku.bg,
  },
  modeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  textLocation: {
    color: theme.colors.location.text,
  },
  textSku: {
    color: theme.colors.sku.text,
  },
  subtext: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    minHeight: 50,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  cameraButton: {
    flex: 2,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  cameraButtonText: {
    color: theme.colors.textInverse,
    fontWeight: "800",
    fontSize: 14,
  },
  manualButton: {
    flex: 1,
    backgroundColor: theme.colors.successSurface,
    borderWidth: 1.5,
    borderColor: theme.colors.success,
    borderRadius: theme.radii.md,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  manualButtonText: {
    color: theme.colors.successDark,
    fontWeight: "800",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
  status: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: theme.spacing.xs + 2,
  },
  cameraWrap: {
    height: 330,
    marginTop: theme.spacing.md,
    overflow: "hidden",
    borderRadius: theme.radii.xl,
    backgroundColor: "#000",
    position: "relative",
  },
  reticle: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "26%",
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#38BDF8",
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#38BDF8",
    borderTopRightRadius: 6,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#38BDF8",
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "#38BDF8",
    borderBottomRightRadius: 6,
  },
  scanLaser: {
    width: "90%",
    height: 2,
    backgroundColor: "#38BDF8",
    opacity: 0.8,
  },
  cameraFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing.md,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    alignItems: "center",
  },
  cameraText: {
    color: theme.colors.textInverse,
    fontWeight: "700",
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  close: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.radii.full,
    minHeight: 44,
    justifyContent: "center",
  },
  closeText: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 13,
  },
});
