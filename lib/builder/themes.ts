/**
 * The ten themes a friend can pick.
 *
 * A theme is colour + type + stage lighting, and nothing else: layout and
 * motion are the same system for everyone, which is what keeps every
 * generated site looking designed rather than assembled.
 *
 * Colours are plain hex so `scripts/check-contrast.ts` can verify every
 * text tone against every surface, per theme, in CI. Hairlines are alpha
 * overlays and are decorative, so they are not contrast-checked.
 */

export interface ThemeFonts {
  /** Google Fonts family names. */
  display: string;
  sans: string;
  mono: string;
  script: string;
  /** CSS weight for the display face, and whether headlines are uppercased. */
  displayWeight: number;
  displayUpper: boolean;
  /** Full Google Fonts css2 URL for all four families. */
  href: string;
}

export interface ThemeColors {
  bg: string;
  bgSunken: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentContrast: string; // text on an accent fill
  gradientFrom: string; // headline gradient
  gradientTo: string;
  glow: string; // rgba, spotlight + halos
  hairline: string; // rgba
  hairlineStrong: string; // rgba
  stage: string; // hero backdrop base
  stageSpot: string; // rgba, the cone of light
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  mode: "dark" | "light";
  colors: ThemeColors;
  fonts: ThemeFonts;
}

const gf = (families: string[]) =>
  `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;

const ALLURA = "Allura";

export const THEMES: readonly Theme[] = [
  {
    id: "noir-gold",
    name: "Noir Gold",
    blurb: "Cinema black, spotlight gold. The original.",
    mode: "dark",
    colors: {
      bg: "#0b0b0d", bgSunken: "#070708", surface: "#141417", surfaceRaised: "#1c1c20",
      text: "#f3f1ec", textSecondary: "#bdb8ae", textTertiary: "#928d84",
      accent: "#eba84d", accentContrast: "#0b0b0d",
      gradientFrom: "#f7d58c", gradientTo: "#d98a2b",
      glow: "rgba(235,168,77,0.32)", hairline: "rgba(255,255,255,0.08)", hairlineStrong: "rgba(255,255,255,0.18)",
      stage: "#0a0a0c", stageSpot: "rgba(235,168,77,0.16)",
    },
    fonts: {
      display: "Archivo", sans: "Instrument Sans", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 800, displayUpper: true,
      href: gf(["Archivo:wdth,wght@62..125,700..900", "Instrument+Sans:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "midnight-indigo",
    name: "Midnight Indigo",
    blurb: "Deep navy with an electric indigo edge.",
    mode: "dark",
    colors: {
      bg: "#0a0b16", bgSunken: "#06070f", surface: "#121429", surfaceRaised: "#1a1d38",
      text: "#eef0ff", textSecondary: "#b6badb", textTertiary: "#8f94bb",
      accent: "#8f97ff", accentContrast: "#0a0b16",
      gradientFrom: "#c3c7ff", gradientTo: "#6d74f0",
      glow: "rgba(143,151,255,0.32)", hairline: "rgba(200,205,255,0.09)", hairlineStrong: "rgba(200,205,255,0.2)",
      stage: "#080914", stageSpot: "rgba(143,151,255,0.16)",
    },
    fonts: {
      display: "Space Grotesk", sans: "Inter", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 700, displayUpper: false,
      href: gf(["Space+Grotesk:wght@500..700", "Inter:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "emerald-terminal",
    name: "Emerald Terminal",
    blurb: "A dark console lit in phosphor green.",
    mode: "dark",
    colors: {
      bg: "#07110d", bgSunken: "#040a07", surface: "#0e1b15", surfaceRaised: "#15251d",
      text: "#e7f6ee", textSecondary: "#a8c7b5", textTertiary: "#83a291",
      accent: "#3ddc97", accentContrast: "#04100a",
      gradientFrom: "#9ff5cc", gradientTo: "#16b378",
      glow: "rgba(61,220,151,0.28)", hairline: "rgba(180,255,220,0.08)", hairlineStrong: "rgba(180,255,220,0.18)",
      stage: "#050d09", stageSpot: "rgba(61,220,151,0.14)",
    },
    fonts: {
      display: "IBM Plex Mono", sans: "IBM Plex Sans", mono: "IBM Plex Mono", script: ALLURA,
      displayWeight: 700, displayUpper: false,
      href: gf(["IBM+Plex+Mono:wght@400;600;700", "IBM+Plex+Sans:wght@400..700", ALLURA]),
    },
  },
  {
    id: "crimson-cinema",
    name: "Crimson Cinema",
    blurb: "Red carpet, velvet dark, bold condensed type.",
    mode: "dark",
    colors: {
      bg: "#0f0809", bgSunken: "#090405", surface: "#1b1013", surfaceRaised: "#25161a",
      text: "#f8eeef", textSecondary: "#cdb6b9", textTertiary: "#a58a8e",
      accent: "#ff6b78", accentContrast: "#12060a",
      gradientFrom: "#ffb3ba", gradientTo: "#e0283e",
      glow: "rgba(255,107,120,0.28)", hairline: "rgba(255,210,215,0.08)", hairlineStrong: "rgba(255,210,215,0.18)",
      stage: "#0c0607", stageSpot: "rgba(255,107,120,0.14)",
    },
    fonts: {
      display: "Oswald", sans: "Inter", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 700, displayUpper: true,
      href: gf(["Oswald:wght@500..700", "Inter:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "royal-violet",
    name: "Royal Violet",
    blurb: "Plum dark with a luminous violet glow.",
    mode: "dark",
    colors: {
      bg: "#0e0a15", bgSunken: "#08060d", surface: "#181124", surfaceRaised: "#21182f",
      text: "#f4effb", textSecondary: "#c3b7d9", textTertiary: "#9b8eb4",
      accent: "#c58bff", accentContrast: "#0e0a15",
      gradientFrom: "#ead3ff", gradientTo: "#9b4bf0",
      glow: "rgba(197,139,255,0.3)", hairline: "rgba(230,210,255,0.09)", hairlineStrong: "rgba(230,210,255,0.2)",
      stage: "#0b0812", stageSpot: "rgba(197,139,255,0.15)",
    },
    fonts: {
      display: "Syne", sans: "DM Sans", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 800, displayUpper: false,
      href: gf(["Syne:wght@600..800", "DM+Sans:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "sunset-coral",
    name: "Sunset Coral",
    blurb: "Warm dusk tones and an elegant serif.",
    mode: "dark",
    colors: {
      bg: "#130c0b", bgSunken: "#0c0706", surface: "#1e1412", surfaceRaised: "#281b18",
      text: "#fcf1eb", textSecondary: "#d6c1b7", textTertiary: "#ab958b",
      accent: "#ff9466", accentContrast: "#140a06",
      gradientFrom: "#ffcba8", gradientTo: "#ef6431",
      glow: "rgba(255,148,102,0.3)", hairline: "rgba(255,225,210,0.09)", hairlineStrong: "rgba(255,225,210,0.2)",
      stage: "#100a09", stageSpot: "rgba(255,148,102,0.15)",
    },
    fonts: {
      display: "Fraunces", sans: "Manrope", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 700, displayUpper: false,
      href: gf(["Fraunces:opsz,wght@9..144,600..800", "Manrope:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "forest-sage",
    name: "Forest Sage",
    blurb: "Calm greens, editorial serif, quiet confidence.",
    mode: "dark",
    colors: {
      bg: "#0b0f0c", bgSunken: "#070a08", surface: "#131a15", surfaceRaised: "#1b241d",
      text: "#eef3ec", textSecondary: "#b8c6b6", textTertiary: "#8f9f8d",
      accent: "#a9cc8a", accentContrast: "#0b0f0c",
      gradientFrom: "#d6ebc2", gradientTo: "#75a152",
      glow: "rgba(169,204,138,0.26)", hairline: "rgba(220,240,210,0.08)", hairlineStrong: "rgba(220,240,210,0.18)",
      stage: "#090c0a", stageSpot: "rgba(169,204,138,0.13)",
    },
    fonts: {
      display: "Playfair Display", sans: "Karla", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 700, displayUpper: false,
      href: gf(["Playfair+Display:wght@600..800", "Karla:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "graphite-mono",
    name: "Graphite Mono",
    blurb: "Pure monochrome. Nothing but type and light.",
    mode: "dark",
    colors: {
      bg: "#0c0c0c", bgSunken: "#070707", surface: "#161616", surfaceRaised: "#1f1f1f",
      text: "#f2f2f2", textSecondary: "#bababa", textTertiary: "#939393",
      accent: "#e8e8e8", accentContrast: "#0c0c0c",
      gradientFrom: "#ffffff", gradientTo: "#9a9a9a",
      glow: "rgba(255,255,255,0.18)", hairline: "rgba(255,255,255,0.08)", hairlineStrong: "rgba(255,255,255,0.18)",
      stage: "#0a0a0a", stageSpot: "rgba(255,255,255,0.1)",
    },
    fonts: {
      display: "Inter Tight", sans: "Inter", mono: "IBM Plex Mono", script: ALLURA,
      displayWeight: 800, displayUpper: true,
      href: gf(["Inter+Tight:wght@600..800", "Inter:wght@400..700", "IBM+Plex+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "arctic-frost",
    name: "Arctic Frost",
    blurb: "Bright, crisp and blue. A daylight portfolio.",
    mode: "light",
    colors: {
      bg: "#f4f7fb", bgSunken: "#e8eef6", surface: "#ffffff", surfaceRaised: "#ffffff",
      text: "#0f1a2b", textSecondary: "#3b485c", textTertiary: "#556175",
      accent: "#1b5ad0", accentContrast: "#ffffff",
      gradientFrom: "#2563eb", gradientTo: "#0b3a99",
      glow: "rgba(37,99,235,0.2)", hairline: "rgba(15,26,43,0.1)", hairlineStrong: "rgba(15,26,43,0.22)",
      stage: "#e6edf7", stageSpot: "rgba(255,255,255,0.7)",
    },
    fonts: {
      display: "Outfit", sans: "Manrope", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 800, displayUpper: false,
      href: gf(["Outfit:wght@600..800", "Manrope:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
  {
    id: "paper-ink",
    name: "Paper & Ink",
    blurb: "Warm paper, burnt-ochre ink. Magazine calm.",
    mode: "light",
    colors: {
      bg: "#f5f1e8", bgSunken: "#ebe5d8", surface: "#fbf8f1", surfaceRaised: "#ffffff",
      text: "#1c1a16", textSecondary: "#48433a", textTertiary: "#645e53",
      accent: "#94450f", accentContrast: "#fbf8f1",
      gradientFrom: "#b8611f", gradientTo: "#6e2f06",
      glow: "rgba(184,97,31,0.18)", hairline: "rgba(28,26,22,0.1)", hairlineStrong: "rgba(28,26,22,0.22)",
      stage: "#ece5d6", stageSpot: "rgba(255,250,240,0.75)",
    },
    fonts: {
      display: "Instrument Serif", sans: "Instrument Sans", mono: "JetBrains Mono", script: ALLURA,
      displayWeight: 400, displayUpper: false,
      href: gf(["Instrument+Serif:ital@0;1", "Instrument+Sans:wght@400..700", "JetBrains+Mono:wght@400;600", ALLURA]),
    },
  },
];

export const DEFAULT_THEME_ID = "noir-gold";

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
