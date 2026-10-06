export const theme = {
  colors: {
    // Brand & Roles
    primary: "#0284C7", // Sky 600
    primaryDark: "#0369A1", // Sky 700
    primaryLight: "#E0F2FE", // Sky 100
    primarySurface: "#F0F9FF", // Sky 50

    picker: {
      primary: "#0284C7",
      light: "#E0F2FE",
      surface: "#F0F9FF",
      border: "#BAE6FD",
      text: "#0369A1",
    },
    packer: {
      primary: "#6366F1", // Indigo 500
      light: "#EEF2FF", // Indigo 50
      surface: "#F5F3FF", // Indigo/Violet surface
      border: "#C7D2FE",
      text: "#4338CA",
    },

    // Status indicators
    success: "#10B981", // Emerald 500
    successDark: "#047857",
    successLight: "#D1FAE5",
    successSurface: "#ECFDF5",

    warning: "#F59E0B", // Amber 500
    warningDark: "#B45309",
    warningLight: "#FEF3C7",
    warningSurface: "#FFFBEB",

    danger: "#EF4444", // Red 500
    dangerDark: "#B91C1C",
    dangerLight: "#FEE2E2",
    dangerSurface: "#FEF2F2",

    // Priority badges
    priorityHigh: {
      bg: "#FEE2E2",
      text: "#B91C1C",
      border: "#FECACA",
    },
    priorityNormal: {
      bg: "#E0F2FE",
      text: "#0369A1",
      border: "#BAE6FD",
    },
    priorityLow: {
      bg: "#F1F5F9",
      text: "#475569",
      border: "#CBD5E1",
    },

    // Warehouse floor high-visibility highlights
    location: {
      bg: "#FEF3C7", // Bright Amber/Yellow for dim warehouse aisles
      border: "#FDE68A",
      text: "#92400E",
      icon: "#D97706",
    },
    sku: {
      bg: "#F3E8FF", // Distinct Purple
      border: "#E9D5FF",
      text: "#6B21A8",
      icon: "#9333EA",
    },

    // Surfaces & Backgrounds
    background: "#F8FAFC", // Slate 50
    surface: "#FFFFFF",
    surfaceAlt: "#F1F5F9", // Slate 100
    surfaceInput: "#F8FAFC",

    // Borders
    border: "#E2E8F0", // Slate 200
    borderDark: "#CBD5E1", // Slate 300
    borderSubtle: "#F1F5F9",
    borderFocused: "#0284C7",

    // Typography
    text: "#0F172A", // Slate 900 - High contrast
    textSecondary: "#334155", // Slate 700
    textMuted: "#64748B", // Slate 500
    textSubtle: "#94A3B8", // Slate 400
    textInverse: "#FFFFFF",
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  radii: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    full: 9999,
  },

  shadows: {
    sm: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 5,
      elevation: 2,
    },
    lg: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 4,
    },
  },
};

export type Theme = typeof theme;
