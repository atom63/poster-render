export const SPACING_PRESETS = {
  sm: { padX: 64,  padY: 64,  footerH: 48, sectionGap: 40, headlineToBody: 24 },
  md: { padX: 100, padY: 100, footerH: 60, sectionGap: 56, headlineToBody: 32 },
  lg: { padX: 140, padY: 140, footerH: 72, sectionGap: 72, headlineToBody: 44 },
};

export const TYPE_PRESETS = {
  sm: {
    title:    { size: 108, weight: "800",    lineHeight: 128 },
    subtitle: { size: 34,  weight: "normal", lineHeight: 52 },
    headline: { size: 52,  weight: "600",    lineHeight: 70 },
    body:     { size: 34,  weight: "normal", lineHeight: 51 },
    small:    { size: 22,  weight: "normal", lineHeight: 34 },
    code:     { size: 28,  weight: "normal", lineHeight: 44 },
  },
  md: {
    title:    { size: 121, weight: "800",    lineHeight: 144 },
    subtitle: { size: 38,  weight: "normal", lineHeight: 58 },
    headline: { size: 58,  weight: "600",    lineHeight: 78 },
    body:     { size: 38,  weight: "normal", lineHeight: 57 },
    small:    { size: 25,  weight: "normal", lineHeight: 38 },
    code:     { size: 30,  weight: "normal", lineHeight: 48 },
  },
  lg: {
    title:    { size: 135, weight: "800",    lineHeight: 160 },
    subtitle: { size: 42,  weight: "normal", lineHeight: 64 },
    headline: { size: 65,  weight: "600",    lineHeight: 86 },
    body:     { size: 42,  weight: "normal", lineHeight: 64 },
    small:    { size: 28,  weight: "normal", lineHeight: 42 },
    code:     { size: 34,  weight: "normal", lineHeight: 54 },
  },
};

export const TYPE_RAMP_PRESETS = {
  "golden-ratio": { ratio: 1.618, base: 38 },
};

export const TYPOGRAPHY_PRESETS = TYPE_PRESETS;
export const TYPOGRAPHY_SCALES = TYPE_RAMP_PRESETS;

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

function _normalizeSeedToken(value) {
  if (value == null) return null;
  const token = String(value).trim();
  return token || null;
}

export function normalizeEastereggConfig(value, { enabled = null, seed = null, intensity = null } = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : value === true
      ? {}
      : null;
  const requestedMode = raw?.mode;
  const requestedEnabled = enabled ?? (value === true || requestedMode === 'random-patterns' || raw?.enabled === true);
  if (!requestedEnabled) return null;
  if (enabled !== true && (value === false || requestedMode === 'off')) return null;
  return {
    mode: 'random-patterns',
    seed: _normalizeSeedToken(seed ?? raw?.seed ?? raw?.easterEggSeed),
    intensity: (intensity ?? raw?.intensity) === 'medium' ? 'medium' : 'low',
  };
}

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

export function normalizeTypePresetName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name || null;
}

function cloneTypeMap(typeMap) {
  const cloned = {};
  for (const [key, value] of Object.entries(typeMap || {})) {
    cloned[key] = { ...value };
  }
  return cloned;
}

function scaleTypeFromRamp(baseType, ramp) {
  const { ratio, base } = ramp;
  const line = (size) => Math.max(size + 8, Math.round(size * 1.35));
  return {
    title:    { ...baseType.title,    size: Math.round(base * ratio * ratio * ratio), lineHeight: line(Math.round(base * ratio * ratio * ratio)) },
    subtitle: { ...baseType.subtitle, size: Math.round(base * ratio),                 lineHeight: line(Math.round(base * ratio)) },
    headline: { ...baseType.headline, size: Math.round(base * ratio * ratio),        lineHeight: line(Math.round(base * ratio * ratio)) },
    body:     { ...baseType.body,     size: base,                                    lineHeight: line(base) },
    small:    { ...baseType.small,    size: Math.round(base / ratio),                lineHeight: line(Math.round(base / ratio)) },
    code:     { ...baseType.code,     size: Math.round(base * ratio),                lineHeight: line(Math.round(base * ratio)) },
  };
}

export function resolveTypography(name, baseType, presets = TYPOGRAPHY_PRESETS, scales = TYPOGRAPHY_SCALES) {
  const typographyName = normalizeTypePresetName(name);
  if (!typographyName || !baseType) return null;
  if (presets[typographyName]) return cloneTypeMap(presets[typographyName]);
  if (scales[typographyName]) return scaleTypeFromRamp(baseType, scales[typographyName]);
  return null;
}

export function resolveThemeConfig({
  TOKENS,
  SEGMENT_PAD,
  contentTheme = {},
  contentEasterEgg = null,
  cliPalette,
  cliSpacing,
  cliTypography,
  cliType,
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
  const typographyName = normalizeTypePresetName(cliTypography) || normalizeTypePresetName(cliType) || normalizeTypePresetName(contentTheme.typography) || normalizeTypePresetName(contentTheme.typePreset) || normalizeTypePresetName(contentTheme.type);
  const resolvedType = resolveTypography(typographyName, TOKENS.type);
  theme.typography = resolvedType ? typographyName : null;
  theme.resolvedType = resolvedType;
  if (cliType) {
    if (TYPE_PRESETS[cliType]) theme.typePreset = cliType;
    else if (TYPE_RAMP_PRESETS[cliType]) theme.typeRamp = cliType;
  }

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