export const theme = {
  color: {
    // YBM reference visual language
    bg: "#f6f8fc",
    surface: "#ffffff",
    surfaceContainerLow: "#f9fafb",
    surfaceContainer: "#f1f5f9",
    surfaceContainerHigh: "#eef2f6",
    surfaceContainerHighest: "#e5e7eb",
    surfaceDim: "#dbe2ea",

    ink: "#172033",
    muted: "#64748b",
    faint: "#94a3b8",
    line: "#e4e9f2",

    // Brand
    primary: "#0c831f",
    primaryContainer: "#0c831f",
    primaryDark: "#086b19",
    primaryFixed: "#e6f4ea",
    primaryFixedDim: "#c8e6d0",
    onPrimary: "#ffffff",
    onPrimaryContainer: "#ffffff",
    onPrimaryFixed: "#063b10",
    inverseSurface: "#233144",
    inverseOnSurface: "#ffffff",

    // Reference brand yellow
    brandYellow: "#ffc200",
    brandYellowBorder: "#eab308",

    // Role colours
    picker: {
      primary: "#0c831f",
      light: "#e6f4ea",
      surface: "#f3faf5",
      border: "#b9dfc0",
      text: "#0c831f",
    },
    packer: {
      primary: "#d97706",
      light: "#fef3c7",
      surface: "#fffbeb",
      border: "#fcd34d",
      text: "#b45309",
    },

    secondary: "#4e5f7a",
    secondaryContainer: "#e2e8f0",
    onSecondary: "#ffffff",
    onSecondaryContainer: "#334155",

    tertiary: "#2563eb",
    tertiaryContainer: "#dbeafe",
    onTertiaryContainer: "#1e40af",
    tertiaryFixedDim: "#93c5fd",

    okBg: "#e6f4ea",
    okInk: "#0c831f",
    warnBg: "#fef3c7",
    warnInk: "#92400e",
    badBg: "#fef2f2",
    badInk: "#991b1b",
    infoBg: "#eff6ff",
    infoInk: "#1e40af",
    critical: "#dc2626",
  },
  type: {
    displayXl: { fontSize: 36, fontWeight: "800" as const, letterSpacing: -0.72 },
    display: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.28 },
    title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.24 },
    titleMd: { fontSize: 20, fontWeight: "700" as const },
    section: { fontSize: 18, fontWeight: "700" as const },
    body: { fontSize: 16, fontWeight: "500" as const },
    bodyMd: { fontSize: 14, fontWeight: "400" as const },
    secondary: { fontSize: 12, fontWeight: "500" as const },
    labelLg: { fontSize: 14, fontWeight: "700" as const, letterSpacing: 0.28 },
    labelMd: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 0.48 },
    labelSm: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.6 },
    codeLg: { fontSize: 20, fontWeight: "700" as const, letterSpacing: 0.4 },
    codeMd: { fontSize: 15, fontWeight: "600" as const, letterSpacing: 0.15 },
    codeDisplay: { fontSize: 32, fontWeight: "700" as const, letterSpacing: 1.28 },
    button: { fontSize: 14, fontWeight: "800" as const, letterSpacing: 0.28 },
    badge: { fontSize: 12, fontWeight: "700" as const, letterSpacing: 0.48 },
    caption: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.6 },
  },
  space: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 },
  radius: { sm: 10, md: 14, lg: 18, pill: 999 },
  touch: { min: 48, primary: 56 },
  picker: { primary: "#0c831f", light: "#e6f4ea", surface: "#f3faf5", border: "#b9dfc0", text: "#0c831f" },
  packer: { primary: "#d97706", light: "#fef3c7", surface: "#fffbeb", border: "#fcd34d", text: "#b45309" },
  brandYellow: "#ffc200",
  brandYellowBorder: "#eab308",
  colors: {
    text: "#172033", textSecondary: "#334155", textMuted: "#64748b", textSubtle: "#94a3b8", textInverse: "#ffffff",
    surface: "#ffffff", borderDark: "#cbd5e1", primary: "#0c831f", success: "#10b981", successDark: "#047857", successSurface: "#ecfdf5",
    location: { bg: "#fef3c7", border: "#fde68a", text: "#92400e", icon: "#d97706" },
    sku: { bg: "#f3e8ff", border: "#e9d5ff", text: "#6b21a8", icon: "#9333ea" },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  radii: { sm: 10, md: 14, lg: 18, xl: 20, full: 9999 },
  shadows: {
    sm: { shadowColor: "#172033", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    md: { shadowColor: "#172033", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 5, elevation: 2 },
    lg: { shadowColor: "#172033", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  },  shadow: {
    sm: { shadowColor: "#172033", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    md: { shadowColor: "#172033", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 5, elevation: 2 },
    lg: { shadowColor: "#172033", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  },
} as const;

export type Theme = typeof theme;