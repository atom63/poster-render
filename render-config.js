export const SPACING_PRESETS = {
  sm: { padX: 64,  padY: 64,  footerH: 48, sectionGap: 40, headlineToBody: 24 },
  md: { padX: 100, padY: 100, footerH: 60, sectionGap: 56, headlineToBody: 32 },
  lg: { padX: 140, padY: 140, footerH: 72, sectionGap: 72, headlineToBody: 44 },
};

export const COLOR_PALETTES = {
  light: {
    background:      "#FAFAF8",
    foreground:      "#09090B",
    mutedForeground: "#71717A",
    subtleForeground:"#A1A1AA",
    accent:          "#09090B",
    cardBg:          "#F0F0EE",
    cardTint:        null,
    onImageForeground: "#FFFFFF",
    onImageMutedForeground: "rgba(255,255,255,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-light",
  },
  dark: {
    background:      "#09090B",
    foreground:      "#FAFAF8",
    mutedForeground: "#A1A1AA",
    subtleForeground:"#52525B",
    accent:          "#FAFAF8",
    cardBg:          "#2A2A2F",
    cardTint:        null,
    onImageForeground: "#FAFAF8",
    onImageMutedForeground: "rgba(250,250,248,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-dark-dimmed",
  },
  warm: {
    background:      "#FEFCE8",
    backgroundGradient: ["#FEFCE8", "#FEF08A"],
    foreground:      "#1A1400",
    mutedForeground: "#7A6E20",
    subtleForeground:"#B8AA50",
    accent:          "#1A1400",
    cardBg:          "#F5EDB8",
    cardTint:        null,
    onImageForeground: "#FFFFFF",
    onImageMutedForeground: "rgba(255,255,255,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-light",
  },
  slate: {
    background:      "#0F172A",
    backgroundGradient: ["#0F172A", "#1E1B4B"],
    foreground:      "#E2E8F0",
    mutedForeground: "#94A3B8",
    subtleForeground:"#475569",
    accent:          "#E2E8F0",
    cardBg:          "#1E2A40",
    cardTint:        null,
    onImageForeground: "#E2E8F0",
    onImageMutedForeground: "rgba(226,232,240,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-dark-dimmed",
  },
  paper: {
    background:      "#FDF6ED",
    foreground:      "#1A0E00",
    mutedForeground: "#8A5A20",
    subtleForeground:"#C49A60",
    accent:          "#1A0E00",
    cardBg:          "#F0E5D0",
    cardTint:        null,
    onImageForeground: "#FFFFFF",
    onImageMutedForeground: "rgba(255,255,255,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-light",
  },
  teal: {
    background:      "#E8F5F3",
    foreground:      "#0D2B27",
    mutedForeground: "#4A8C82",
    subtleForeground:"#8ABDB6",
    accent:          "#0D2B27",
    cardBg:          "#F0FAF8",
    cardTint:        null,
    onImageForeground: "#FFFFFF",
    onImageMutedForeground: "rgba(255,255,255,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-light",
  },
  midnight: {
    background:      "#1A1A1A",
    backgroundGradient: ["#1A1A1A", "#2D1B4E"],
    foreground:      "#F0EDE6",
    mutedForeground: "#A09890",
    subtleForeground:"#585250",
    accent:          "#F0EDE6",
    cardBg:          "#28223A",
    cardTint:        null,
    onImageForeground: "#F0EDE6",
    onImageMutedForeground: "rgba(240,237,230,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-dark-dimmed",
  },
  clay: {
    background:      "#F6EEE9",
    backgroundGradient: ["#F6EEE9", "#E7D1C8"],
    foreground:      "#231612",
    mutedForeground: "#6E5851",
    subtleForeground:"#A6918A",
    accent:          "#5C2E26",
    cardBg:          "#EAD8D0",
    cardTint:        null,
    onImageForeground: "#FFFFFF",
    onImageMutedForeground: "rgba(255,255,255,0.75)",
    borderAlpha: 0.15, gridAlpha: 0.12, calloutAccentAlpha: 0.6, headerTintAlpha: 0.05,
    cardBorderAlpha: 0.1, cardTintFallback: 0.18, codeTheme: "github-light",
  },
};

export const TEMPLATE_REGISTRY = {
  default: {
    name: "default",
    layoutFamily: "default",
    coverStyle: "card",
  },
};

import { normalizeEastereggConfig } from "./render-pattern.js";

export function resolveThemeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTemplateName(value, fallbackName = TEMPLATE_REGISTRY.default.name) {
  if (typeof value !== "string") return fallbackName;
  const name = value.trim();
  return name || fallbackName;
}

export function resolveTemplateName(content, fallbackName = TEMPLATE_REGISTRY.default.name) {
  return normalizeTemplateName(content?.template ?? content?.boardStyle, fallbackName);
}

export function resolveTemplate(templateName) {
  return TEMPLATE_REGISTRY[normalizeTemplateName(templateName)] || TEMPLATE_REGISTRY.default;
}

export function resolveLayout(theme, template = TEMPLATE_REGISTRY.default, tokens, spacingPresets = SPACING_PRESETS) {
  const preset = spacingPresets[theme.spacing] || spacingPresets.md;
  return {
    padX:           preset.padX,
    padY:           preset.padY,
    footerH:        preset.footerH,
    sectionGap:     preset.sectionGap,
    headlineToBody: preset.headlineToBody,
    layoutFamily:   template.layoutFamily || TEMPLATE_REGISTRY.default.layoutFamily,
    contentX:       preset.padX,
    contentWidth:   tokens.canvas.width - preset.padX * 2,
    contentTop:     preset.padY,
    contentBottom:  tokens.canvas.height - preset.padY - preset.footerH,
    counterY:       tokens.canvas.height - preset.padY - preset.footerH + Math.round(preset.footerH / 2) - Math.round(tokens.type.small.lineHeight / 2),
  };
}

export function resolveThemeConfig({
  TOKENS,
  SEGMENT_PAD,
  contentTheme = {},
  contentEasterEgg = null,
  cliPalette,
  cliSpacing,
  cliEasterEgg = false,
  cliSeed = null,
  colorPalettes = COLOR_PALETTES,
}) {
  const paletteName = cliPalette || contentTheme.palette || TOKENS.theme.palette;
  const palette = colorPalettes[paletteName] || colorPalettes.light;
  const COLOR_KEYS = ["background", "foreground", "mutedForeground", "subtleForeground", "accent", "onImageForeground", "onImageMutedForeground"];
  const theme = {
    ...TOKENS.theme,
    ...palette,
    ...contentTheme,
    palette: paletteName,
  };

  for (const key of COLOR_KEYS) {
    if (!contentTheme[key]) theme[key] = palette[key];
  }

  if (cliSpacing && SPACING_PRESETS[cliSpacing]) theme.spacing = cliSpacing;

  const normalizedEasterEgg = normalizeEastereggConfig(contentEasterEgg ?? contentTheme.easterEgg, {
    enabled: cliEasterEgg ? true : null,
    seed: cliSeed,
  });
  theme.easterEgg = normalizedEasterEgg;

  theme.codeFontSize = resolveThemeNumber(theme.codeFontSize, TOKENS.type.code.size);
  theme.codeLineHeight = resolveThemeNumber(theme.codeLineHeight, TOKENS.type.code.lineHeight);
  theme.codePadTop = resolveThemeNumber(theme.codePadTop, SEGMENT_PAD.code.top);
  theme.codePadBottom = resolveThemeNumber(theme.codePadBottom, SEGMENT_PAD.code.bottom);
  theme.codePadLeft = resolveThemeNumber(theme.codePadLeft, SEGMENT_PAD.code.left);
  theme.codePadRight = resolveThemeNumber(theme.codePadRight, SEGMENT_PAD.code.right);

  // Markdown rendering theme tokens — backward-compat defaults for custom palettes.
  theme.borderAlpha        = theme.borderAlpha        ?? 0.15;
  theme.gridAlpha          = theme.gridAlpha          ?? 0.12;
  theme.calloutAccentAlpha = theme.calloutAccentAlpha ?? 0.6;
  theme.headerTintAlpha    = theme.headerTintAlpha    ?? 0.05;
  theme.cardBorderAlpha    = theme.cardBorderAlpha    ?? 0.1;
  theme.cardTintFallback   = theme.cardTintFallback   ?? 0.18;
  if (theme.codeTheme === undefined) theme.codeTheme = null;

  return theme;
}