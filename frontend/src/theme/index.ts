export const theme = {
  color: {
    // YBM reference visual language
    bg: "#f8fafc", // A slightly softer, cleaner background
    surface: "#ffffff",
    surfaceContainerLow: "#f1f5f9",
    surfaceContainer: "#e2e8f0",
    surfaceContainerHigh: "#cbd5e1",
    surfaceContainerHighest: "#94a3b8",
    surfaceDim: "#e2e8f0",

    ink: "#0f172a", // Darker ink for better contrast
    muted: "#64748b",
    faint: "#94a3b8",
    line: "#e2e8f0",

    // Brand
    primary: "#0ea5e9", // A more modern, approachable blue-primary
    primaryContainer: "#0284c7",
    primaryDark: "#0369a1",
    primaryFixed: "#e0f2fe",
    primaryFixedDim: "#bae6fd",
    onPrimary: "#ffffff",
    onPrimaryContainer: "#ffffff",
    onPrimaryFixed: "#0c4a6e",
    inverseSurface: "#0f172a",
    inverseOnSurface: "#ffffff",

    // Reference brand yellow
    brandYellow: "#f59e0b",
    brandYellowBorder: "#d97706",

    // Role colours
    picker: {
      primary: "#0ea5e9",
      light: "#e0f2fe",
      surface: "#f0f9ff",
      border: "#bae6fd",
      text: "#0369a1",
    },
    packer: {
      primary: "#f59e0b",
      light: "#fef3c7",
      surface: "#fffbeb",
      border: "#fde68a",
      text: "#b45309",
    },

    secondary: "#64748b",
    secondaryContainer: "#f1f5f9",
    onSecondary: "#ffffff",
    onSecondaryContainer: "#1e293b",

    tertiary: "#8b5cf6",
    tertiaryContainer: "#ede9fe",
    onTertiaryContainer: "#5b21b6",
    tertiaryFixedDim: "#c4b5fd",

    okBg: "#dcfce7",
    okInk: "#15803d",
    warnBg: "#fef9c3",
    warnInk: "#a16207",
    badBg: "#fee2e2",
    badInk: "#b91c1c",
    infoBg: "#e0f2fe",
    infoInk: "#0369a1",
    critical: "#ef4444",
  },
  type: {
    displayXl: { fontSize: 40, fontWeight: "800" as const, letterSpacing: -1 },
    display: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.5 },
    title: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.3 },
    titleMd: { fontSize: 22, fontWeight: "700" as const },
    section: { fontSize: 18, fontWeight: "600" as const },
    body: { fontSize: 16, fontWeight: "500" as const, lineHeight: 24 },
    bodyMd: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
    secondary: { fontSize: 13, fontWeight: "500" as const },
    labelLg: { fontSize: 15, fontWeight: "600" as const, letterSpacing: 0.3 },
    labelMd: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0.4 },
    labelSm: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.5 },
    codeLg: { fontSize: 20, fontWeight: "600" as const, letterSpacing: 0.5 },
    codeMd: { fontSize: 15, fontWeight: "500" as const, letterSpacing: 0.2 },
    codeDisplay: { fontSize: 34, fontWeight: "700" as const, letterSpacing: 1.5 },
    button: { fontSize: 16, fontWeight: "700" as const, letterSpacing: 0.3 },
    badge: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0.4 },
    caption: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.5 },
  },
  space: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 },
  radius: { sm: 12, md: 16, lg: 24, pill: 999 },
  touch: { min: 52, primary: 60 },
  picker: { primary: "#0ea5e9", light: "#e0f2fe", surface: "#f0f9ff", border: "#bae6fd", text: "#0369a1" },
  packer: { primary: "#f59e0b", light: "#fef3c7", surface: "#fffbeb", border: "#fde68a", text: "#b45309" },
  brandYellow: "#f59e0b",
  brandYellowBorder: "#d97706",
  colors: {
    text: "#0f172a", textSecondary: "#475569", textMuted: "#64748b", textSubtle: "#94a3b8", textInverse: "#ffffff",
    surface: "#ffffff", borderDark: "#cbd5e1", primary: "#0ea5e9", success: "#10b981", successDark: "#047857", successSurface: "#dcfce7",
    location: { bg: "#fef3c7", border: "#fde68a", text: "#92400e", icon: "#d97706" },
    sku: { bg: "#f3e8ff", border: "#e9d5ff", text: "#6b21a8", icon: "#9333ea" },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 },
  radii: { sm: 12, md: 16, lg: 24, xl: 32, full: 9999 },
  shadows: {
    sm: { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
    md: { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 4 },
    lg: { shadowColor: "#0f172a", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8 },
  },
} as const;

export type Theme = typeof theme;