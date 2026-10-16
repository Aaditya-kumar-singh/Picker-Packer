import { Platform } from "react-native";

const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const theme = {
  color: {
    // Canvas & structural surfaces
    bg: "#f8fafc",
    surface: "#ffffff",
    surfaceContainerLow: "#f8fafc",
    surfaceContainer: "#f1f5f9",
    surfaceContainerHigh: "#e2e8f0",
    surfaceContainerHighest: "#cbd5e1",
    surfaceDim: "#e2e8f0",

    // Contrast text & dividers
    ink: "#0f172a",
    inkSecondary: "#334155",
    muted: "#64748b",
    faint: "#94a3b8",
    line: "#e2e8f0",
    lineStrong: "#cbd5e1",

    // Brand Primary (Cobalt Tech Blue)
    primary: "#0284c7",
    primaryContainer: "#0369a1",
    primaryDark: "#075985",
    primaryLight: "#38bdf8",
    primaryFixed: "#e0f2fe",
    primaryFixedDim: "#bae6fd",
    onPrimary: "#ffffff",
    onPrimaryContainer: "#ffffff",
    onPrimaryFixed: "#0c4a6e",
    inverseSurface: "#0f172a",
    inverseOnSurface: "#ffffff",

    // Brand Industrial Yellow / Amber
    brandYellow: "#f59e0b",
    brandYellowBorder: "#d97706",
    brandYellowDark: "#b45309",

    // Role specific visual languages
    picker: {
      primary: "#0284c7",
      primaryDark: "#0369a1",
      light: "#e0f2fe",
      surface: "#f0f9ff",
      border: "#bae6fd",
      text: "#0369a1",
      gradient: ["#0284c7", "#0369a1"],
    },
    packer: {
      primary: "#d97706",
      primaryDark: "#b45309",
      light: "#fef3c7",
      surface: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
      gradient: ["#f59e0b", "#d97706"],
    },

    // Secondary & Tertiary
    secondary: "#475569",
    secondaryContainer: "#f1f5f9",
    onSecondary: "#ffffff",
    onSecondaryContainer: "#1e293b",

    tertiary: "#7c3aed",
    tertiaryContainer: "#ede9fe",
    onTertiaryContainer: "#5b21b6",
    tertiaryFixedDim: "#c4b5fd",

    // Semantic status tones (High visibility warehouse colors)
    okBg: "#ecfdf5",
    okBorder: "#a7f3d0",
    okInk: "#065f46",
    okPrimary: "#059669",

    warnBg: "#fffbeb",
    warnBorder: "#fde68a",
    warnInk: "#92400e",
    warnPrimary: "#d97706",

    badBg: "#fef2f2",
    badBorder: "#fecaca",
    badInk: "#991b1b",
    badPrimary: "#dc2626",

    infoBg: "#f0f9ff",
    infoBorder: "#bae6fd",
    infoInk: "#0369a1",
    infoPrimary: "#0284c7",

    critical: "#ef4444",
  },

  type: {
    displayXl: { fontFamily: "OpenSans", fontSize: 38, fontWeight: "800" as const, letterSpacing: -1, color: "#0f172a" },
    display: { fontFamily: "OpenSans", fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.5, color: "#0f172a" },
    title: { fontFamily: "OpenSans", fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.3, color: "#0f172a" },
    titleMd: { fontFamily: "OpenSans", fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.2, color: "#0f172a" },
    section: { fontFamily: "OpenSans", fontSize: 17, fontWeight: "700" as const, letterSpacing: -0.1, color: "#0f172a" },
    body: { fontSize: 16, fontWeight: "500" as const, lineHeight: 24, color: "#0f172a" },
    bodyMd: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22, color: "#334155" },
    secondary: { fontSize: 13, fontWeight: "500" as const, color: "#64748b" },
    labelLg: { fontSize: 15, fontWeight: "600" as const, letterSpacing: 0.3, color: "#0f172a" },
    labelMd: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0.4, color: "#334155" },
    labelSm: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.5, color: "#64748b" },
    codeLg: { fontFamily: monoFont, fontSize: 19, fontWeight: "700" as const, letterSpacing: 0.5 },
    codeMd: { fontFamily: monoFont, fontSize: 14, fontWeight: "600" as const, letterSpacing: 0.3 },
    codeDisplay: { fontFamily: monoFont, fontSize: 32, fontWeight: "800" as const, letterSpacing: 1.5 },
    button: { fontSize: 15, fontWeight: "700" as const, letterSpacing: 0.4 },
    badge: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.4 },
    caption: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.5 },
  },

  space: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 28, xxl: 36 },
  radius: { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 },
  touch: { min: 50, primary: 56, large: 62 },

  // Role shortcuts
  picker: {
    primary: "#0284c7",
    primaryDark: "#0369a1",
    light: "#e0f2fe",
    surface: "#f0f9ff",
    border: "#bae6fd",
    text: "#0369a1",
  },
  packer: {
    primary: "#d97706",
    primaryDark: "#b45309",
    light: "#fef3c7",
    surface: "#fffbeb",
    border: "#fde68a",
    text: "#92400e",
  },
  brandYellow: "#f59e0b",
  brandYellowBorder: "#d97706",

  colors: {
    text: "#0f172a",
    textSecondary: "#334155",
    textMuted: "#64748b",
    textSubtle: "#94a3b8",
    textInverse: "#ffffff",
    surface: "#ffffff",
    border: "#e2e8f0",
    borderDark: "#cbd5e1",
    primary: "#0284c7",
    success: "#059669",
    successDark: "#065f46",
    successSurface: "#ecfdf5",
    location: { bg: "#fef3c7", border: "#fde68a", text: "#92400e", icon: "#d97706" },
    sku: { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9", icon: "#7c3aed" },
  },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 },
  radii: { sm: 10, md: 14, lg: 18, xl: 24, full: 9999 },

  shadows: {
    sm: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    md: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    lg: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 6,
    },
  },
} as const;

export type Theme = typeof theme;
