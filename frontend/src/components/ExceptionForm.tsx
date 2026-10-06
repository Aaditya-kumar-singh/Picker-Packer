import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { theme } from "../theme";
import type { OrderItem } from "../api/client";

export type ExceptionType =
  | "SHORT_QUANTITY"
  | "DAMAGED_ITEM"
  | "STOCK_UNAVAILABLE"
  | "WRONG_LOCATION"
  | "WRONG_SKU"
  | "OTHER";

type Props = {
  role: "PICKER" | "PACKER";
  item?: OrderItem;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
};

const allTypes: Array<{ type: ExceptionType; label: string; icon: string }> = [
  { type: "SHORT_QUANTITY", label: "Short Quantity", icon: "📉" },
  { type: "DAMAGED_ITEM", label: "Damaged Item", icon: "⚠️" },
  { type: "STOCK_UNAVAILABLE", label: "Stock Unavailable", icon: "🚫" },
  { type: "WRONG_LOCATION", label: "Wrong Location", icon: "📍" },
  { type: "WRONG_SKU", label: "Wrong SKU", icon: "🏷️" },
  { type: "OTHER", label: "Other Discrepancy", icon: "📝" },
];

export default function ExceptionForm({ role, item, onSubmit, onCancel }: Props) {
  const types = useMemo(
    () =>
      allTypes.filter(
        x => role === "PICKER" || !["WRONG_LOCATION", "STOCK_UNAVAILABLE"].includes(x.type),
      ),
    [role],
  );
  const [type, setType] = useState<ExceptionType>(types[0].type);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const requiresQuantity = ["SHORT_QUANTITY", "DAMAGED_ITEM", "STOCK_UNAVAILABLE"].includes(type);
  const requiresNote = type === "OTHER";

  const submit = async () => {
    const actualQuantity = quantity === "" ? undefined : Number(quantity);
    if (
      requiresQuantity &&
      (actualQuantity === undefined || !Number.isInteger(actualQuantity) || actualQuantity < 0)
    ) {
      Alert.alert("Invalid Quantity", "Enter a non-negative whole number for actual quantity.");
      return;
    }
    if (requiresNote && !note.trim()) {
      Alert.alert("Note Required", "Please describe what happened before saving.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit({
        itemId: item?.id,
        type,
        quantity: actualQuantity,
        note: note.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.alertIcon}>
          <Text style={styles.alertIconText}>⚠️</Text>
        </View>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Report Exception</Text>
          <Text style={styles.item} numberOfLines={1}>
            {item?.productName ?? "Order Discrepancy"}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>SELECT REASON</Text>
      <View style={styles.grid}>
        {types.map(option => {
          const isSelected = type === option.type;
          return (
            <TouchableOpacity
              key={option.type}
              style={[styles.option, isSelected && styles.selected]}
              onPress={() => setType(option.type)}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.optionIcon}>{option.icon}</Text>
              <Text style={[styles.optionText, isSelected && styles.selectedText]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {requiresQuantity ? (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            {type === "DAMAGED_ITEM" ? "DAMAGED QUANTITY" : "ACTUAL / AVAILABLE QUANTITY"}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={type === "DAMAGED_ITEM" ? "Enter damaged quantity" : "Enter quantity found"}
            placeholderTextColor={theme.colors.textSubtle}
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
            editable={!busy}
          />
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          {requiresNote ? "DESCRIPTION (REQUIRED)" : "NOTES / COMMENTS (OPTIONAL)"}
        </Text>
        <TextInput
          style={[styles.input, styles.note]}
          placeholder={requiresNote ? "Explain the discrepancy..." : "Add details for the supervisor..."}
          placeholderTextColor={theme.colors.textSubtle}
          value={note}
          onChangeText={setNote}
          multiline
          editable={!busy}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.submit, busy && styles.busyButton]}
          onPress={submit}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>{busy ? "Submitting..." : "Submit Exception"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancel}
          onPress={onCancel}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFBEB", // Warning surface
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    ...theme.shadows.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#FEF3C7",
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.sm,
  },
  alertIconText: {
    fontSize: 20,
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#92400E",
  },
  item: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: "#B45309",
    letterSpacing: 0.7,
    marginBottom: theme.spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs + 2,
    marginBottom: theme.spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    minHeight: 44,
  },
  selected: {
    backgroundColor: "#D97706",
    borderColor: "#B45309",
  },
  optionIcon: {
    marginRight: 6,
    fontSize: 14,
  },
  optionText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  selectedText: {
    color: theme.colors.textInverse,
  },
  inputGroup: {
    marginTop: theme.spacing.sm,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
    minHeight: 48,
  },
  note: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  actions: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  submit: {
    backgroundColor: "#D97706",
    paddingVertical: 14,
    borderRadius: theme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  busyButton: {
    opacity: 0.7,
  },
  submitText: {
    color: theme.colors.textInverse,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  cancel: {
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  cancelText: {
    color: theme.colors.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
});
