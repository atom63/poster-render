import { createCanvas, registerFont } from "canvas";
import fs from "fs";
import path from "path";

// Polyfill OffscreenCanvas for pretext (which uses it for text measurement)
globalThis.OffscreenCanvas = class OffscreenCanvas {
  constructor(w, h) {
    this._canvas = createCanvas(w, h);
  }
  getContext(type) {
    return this._canvas.getContext(type);
  }
};

// Now import pretext after polyfill is in place
const { prepareWithSegments, layoutNextLine } = await import(
  "@chenglou/pretext"
);

// --- Shared measurement canvas ---
// Used for text measurement without needing a render ctx
const _measureCanvas = createCanvas(2000, 100);
const _measureCtx = _measureCanvas.getContext("2d");

// --- Spacing Presets ---
// Controls outer margin / bleed on all sides. Pick via content.json "spacing" or --spacing CLI flag.
const SPACING_PRESETS = {
  sm: { padX: 64,  padY: 64,  footerH: 48, sectionGap: 40, headlineToBody: 24 },
  md: { padX: 100, padY: 100, footerH: 60, sectionGap: 56, headlineToBody: 32 },
  lg: { padX: 140, padY: 140, footerH: 72, sectionGap: 72, headlineToBody: 44 },
};

// --- Color Palettes ---
// Each palette defines the full color set. Override per-key via content.json "theme" block.
// bg         — slide background
// fg         — primary text (title, headline)
// muted      — secondary text (subtitle, body)
// subtle     — slide counter, decorative
// accent     — highlight color (unused visually yet, but available for future use)
const COLOR_PALETTES = {
  light: {
    background:      "#FAFAF8",
    foreground:      "#09090B",
    mutedForeground: "#71717A",
    subtleForeground:"#A1A1AA",
    accent:          "#09090B",
  },
  dark: {
    background:      "#09090B",
    foreground:      "#FAFAF8",
    mutedForeground: "#A1A1AA",
    subtleForeground:"#52525B",
    accent:          "#FAFAF8",
  },
  warm: {
    background:      "#FDF6ED",
    foreground:      "#1A0E00",
    mutedForeground: "#8A5A20",
    subtleForeground:"#C49A60",
    accent:          "#1A0E00",
  },
  slate: {
    background:      "#0F172A",
    backgroundGradient: ["#0F172A", "#1E1B4B"],
    foreground:      "#E2E8F0",
    mutedForeground: "#94A3B8",
    subtleForeground:"#475569",
    accent:          "#E2E8F0",
  },
  paper: {
    background:      "#FEFCE8",
    backgroundGradient: ["#FEFCE8", "#FEF08A"],
    foreground:      "#1A1400",
    mutedForeground: "#7A6E20",
    subtleForeground:"#B8AA50",
    accent:          "#1A1400",
  },
  teal: {
    background:      "#E8F5F3",
    foreground:      "#0D2B27",
    mutedForeground: "#4A8C82",
    subtleForeground:"#8ABDB6",
    accent:          "#0D2B27",
  },
  midnight: {
    background:      "#1A1A1A",
    backgroundGradient: ["#1A1A1A", "#2D1B4E"],
    foreground:      "#F0EDE6",
    mutedForeground: "#A09890",
    subtleForeground:"#585250",
    accent:          "#F0EDE6",
  },
};

// --- Design Tokens ---
const TOKENS = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  type: {
    title:    { size: 108, weight: "800", lineHeight: 128 },
    subtitle: { size: 34,  weight: "normal", lineHeight: 52 },
    headline: { size: 52,  weight: "600",    lineHeight: 70 },
    body:     { size: 34,  weight: "normal", lineHeight: 51 },
    small:    { size: 22,  weight: "normal", lineHeight: 34 },
  },
  paragraphGap: 0.25,
  fonts: {
    sans:  { name: "Helvetica Neue", fallback: "Helvetica, Arial, sans-serif" },
    serif: { name: "Georgia",        fallback: "Times New Roman, serif" },
    mono:  { name: "Menlo",          fallback: "Consolas, monospace" },
  },
  // Default theme — palette + typography defaults
  theme: {
    palette:    "light",   // key into COLOR_PALETTES
    fontFamily: "sans",
    spacing:    "md",
  },
};

// --- Layout ---
function resolveLayout(theme) {
  const preset = SPACING_PRESETS[theme.spacing] || SPACING_PRESETS.md;
  return {
    padX:           preset.padX,
    padY:           preset.padY,
    footerH:        preset.footerH,
    sectionGap:     preset.sectionGap,
    headlineToBody: preset.headlineToBody,
    // Derived
    contentX:       preset.padX,
    contentWidth:   TOKENS.canvas.width - preset.padX * 2,
    contentTop:     preset.padY,
    // contentBottom is where text must stop (above footer)
    contentBottom:  TOKENS.canvas.height - preset.padY - preset.footerH,
    // Counter sits vertically centered in the footer zone
    counterY:       TOKENS.canvas.height - preset.padY - preset.footerH + Math.round(preset.footerH / 2) - Math.round(TOKENS.type.small.lineHeight / 2),
  };
}

// --- Font helpers ---
function fontString(typeKey, fontFamily) {
  const t = TOKENS.type[typeKey];
  const fm = TOKENS.fonts[fontFamily] || TOKENS.fonts.sans;
  const family = `"${fm.name}", ${fm.fallback}`;
  const w = t.weight === "normal" ? "" : t.weight + " ";
  return `${w}${t.size}px ${family}`;
}

function monoFontString(size) {
  const fm = TOKENS.fonts.mono;
  return `${size}px "${fm.name}", ${fm.fallback}`;
}

// --- Font registration ---
const FONT_FILE_PATTERNS = [
  { pattern: "geistmono", family: TOKENS.fonts.mono.name },
  { pattern: "geist",     family: TOKENS.fonts.sans.name },
  { pattern: "helvetica", family: "Helvetica Neue" },
  { pattern: "georgia",   family: "Georgia" },
  { pattern: "menlo",     family: "Menlo" },
];

function tryRegisterFonts() {
  const fontsDir = path.resolve("./fonts");
  if (!fs.existsSync(fontsDir)) return;
  for (const file of fs.readdirSync(fontsDir)) {
    if (!/\.(ttf|otf)$/i.test(file)) continue;
    const lower = file.toLowerCase();
    const match = FONT_FILE_PATTERNS.find((p) => lower.includes(p.pattern));
    if (!match) continue;
    const weight = lower.includes("bold") ? "bold"
      : (lower.includes("semibold") || lower.includes("600")) ? "600"
      : "normal";
    try { registerFont(path.join(fontsDir, file), { family: match.family, weight }); } catch {}
  }
}

// --- Canvas creation ---
// bg: solid color string, or gradient will be applied if theme.backgroundGradient is set
function createSlideCanvas(theme) {
  const canvas = createCanvas(TOKENS.canvas.width, TOKENS.canvas.height);
  const ctx = canvas.getContext("2d");
  if (theme.backgroundGradient && theme.backgroundGradient.length >= 2) {
    const grad = ctx.createLinearGradient(0, 0, TOKENS.canvas.width, TOKENS.canvas.height);
    const stops = theme.backgroundGradient;
    stops.forEach((color, i) => grad.addColorStop(i / (stops.length - 1), color));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = theme.background;
  }
  ctx.fillRect(0, 0, TOKENS.canvas.width, TOKENS.canvas.height);
  ctx.textBaseline = "top";
  return { canvas, ctx };
}

// --- Slide counter ---
function drawSlideCounter(ctx, theme, layout, slideNum, totalSlides) {
  const text = String(slideNum).padStart(2, "0") + " / " + String(totalSlides).padStart(2, "0");
  ctx.fillStyle = theme.subtleForeground;
  ctx.font = monoFontString(TOKENS.type.small.size);
  const m = ctx.measureText(text);
  ctx.fillText(text, TOKENS.canvas.width - layout.padX - m.width, layout.counterY);
}

// --- Text layout helpers ---
function collectLines(text, font, maxWidth) {
  const prepared = prepareWithSegments(text, font, { whiteSpace: "pre-wrap" });
  const lines = [];
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  while (true) {
    const line = layoutNextLine(prepared, cursor, maxWidth);
    if (line === null) break;
    lines.push(line);
    cursor = line.end;
  }
  return lines;
}

function measureTextHeight(text, font, maxWidth, lineHeight) {
  return collectLines(text, font, maxWidth).length * lineHeight;
}

// --- Anti-widow ---
// Uses shared _measureCtx — no render ctx needed.
function antiWidowWidth(text, font, maxWidth, { threshold = 0.35, step = 30, maxAttempts = 4 } = {}) {
  _measureCtx.font = font;
  let w = maxWidth;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const lines = collectLines(text, font, w);
    if (lines.length <= 1) break;
    const lastLineWidth = _measureCtx.measureText(lines[lines.length - 1].text).width;
    if (lastLineWidth / w >= threshold) break;
    w -= step;
  }
  return w;
}

// --- Section height (uses anti-widow width for accuracy) ---
function measureSectionHeight(section, headlineFont, bodyFont, headlineLineHeight, bodyLineHeight, layout) {
  let h = 0;
  if (section.headline) {
    const hw = antiWidowWidth(section.headline, headlineFont, layout.contentWidth);
    h += measureTextHeight(section.headline, headlineFont, hw, headlineLineHeight);
    h += layout.headlineToBody;
  }
  if (section.body) {
    const bw = antiWidowWidth(section.body, bodyFont, layout.contentWidth);
    const prepared = prepareWithSegments(section.body, bodyFont, { whiteSpace: "pre-wrap" });
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    while (true) {
      const line = layoutNextLine(prepared, cursor, bw);
      if (line === null) break;
      const isEmpty = line.text.trim() === "";
      h += isEmpty ? Math.round(bodyLineHeight * TOKENS.paragraphGap) : bodyLineHeight;
      cursor = line.end;
    }
  }
  return h;
}

// --- Slide renderers ---
function renderCover(content, theme, layout, totalSlides) {
  const { canvas, ctx } = createSlideCanvas(theme);
  const titleFont = fontString("title", theme.fontFamily);
  const subFont   = fontString("subtitle", theme.fontFamily);
  const subtitleGap = Math.round(layout.headlineToBody * 1.5);
  let y = layout.padY;

  // Title
  const titleW = antiWidowWidth(content.cover.title, titleFont, layout.contentWidth);
  ctx.fillStyle = theme.foreground;
  ctx.font = titleFont;
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  const titlePrepared = prepareWithSegments(content.cover.title, titleFont, { whiteSpace: "pre-wrap" });
  while (true) {
    const line = layoutNextLine(titlePrepared, cursor, titleW);
    if (line === null) break;
    ctx.fillText(line.text, layout.contentX, y);
    cursor = line.end;
    y += TOKENS.type.title.lineHeight;
  }

  // Subtitle
  if (content.cover.subtitle) {
    y += subtitleGap;
    const subW = antiWidowWidth(content.cover.subtitle, subFont, layout.contentWidth);
    ctx.fillStyle = theme.mutedForeground;
    ctx.font = subFont;
    cursor = { segmentIndex: 0, graphemeIndex: 0 };
    const subPrepared = prepareWithSegments(content.cover.subtitle, subFont, { whiteSpace: "pre-wrap" });
    while (true) {
      const line = layoutNextLine(subPrepared, cursor, subW);
      if (line === null) break;
      ctx.fillText(line.text, layout.contentX, y);
      cursor = line.end;
      y += TOKENS.type.subtitle.lineHeight;
    }
  }

  drawSlideCounter(ctx, theme, layout, 1, totalSlides);
  return canvas;
}

function renderCTA(content, theme, layout, slideNum, totalSlides) {
  const { canvas, ctx } = createSlideCanvas(theme);
  const ctaFont = fontString("headline", theme.fontFamily);
  const ctaW = antiWidowWidth(content.cta, ctaFont, layout.contentWidth);
  let y = layout.padY;

  ctx.fillStyle = theme.foreground;
  ctx.font = ctaFont;
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  const ctaPrepared = prepareWithSegments(content.cta, ctaFont, { whiteSpace: "pre-wrap" });
  while (true) {
    const line = layoutNextLine(ctaPrepared, cursor, ctaW);
    if (line === null) break;
    ctx.fillText(line.text, layout.contentX, y);
    cursor = line.end;
    y += TOKENS.type.headline.lineHeight;
  }

  drawSlideCounter(ctx, theme, layout, slideNum, totalSlides);
  return canvas;
}

function renderContentSlides(sections, theme, layout, startSlideNum, totalSlides) {
  const slides = [];
  const bodyFont     = fontString("body", theme.fontFamily);
  const headlineFont = fontString("headline", theme.fontFamily);
  const bodyLH       = TOKENS.type.body.lineHeight;
  const headLH       = TOKENS.type.headline.lineHeight;
  const { sectionGap, headlineToBody } = layout;
  const AVAILABLE_H  = layout.contentBottom - layout.contentTop;

  // Group sections into pages
  const pages = [];
  let currentPage = [], usedH = 0;
  for (let si = 0; si < sections.length; si++) {
    const secH = measureSectionHeight(sections[si], headlineFont, bodyFont, headLH, bodyLH, layout);
    const gap = currentPage.length > 0 ? sectionGap : 0;
    if (currentPage.length > 0 && usedH + gap + secH > AVAILABLE_H) {
      pages.push(currentPage);
      currentPage = [si];
      usedH = secH;
    } else {
      currentPage.push(si);
      usedH += gap + secH;
    }
  }
  if (currentPage.length > 0) pages.push(currentPage);

  let slideNum = startSlideNum;
  for (const pageIndices of pages) {
    const { canvas, ctx } = createSlideCanvas(theme);
    let y = layout.contentTop;

    for (let i = 0; i < pageIndices.length; i++) {
      const section = sections[pageIndices[i]];
      if (i > 0) y += sectionGap;

      if (section.headline) {
        const headW = antiWidowWidth(section.headline, headlineFont, layout.contentWidth);
        ctx.fillStyle = theme.foreground;
        ctx.font = headlineFont;
        let hCursor = { segmentIndex: 0, graphemeIndex: 0 };
        const headPrepared = prepareWithSegments(section.headline, headlineFont, { whiteSpace: "pre-wrap" });
        while (true) {
          const line = layoutNextLine(headPrepared, hCursor, headW);
          if (line === null) break;
          ctx.fillText(line.text, layout.contentX, y);
          hCursor = line.end;
          y += headLH;
        }
        y += headlineToBody;
      }

      if (section.body) {
        const bodyW = antiWidowWidth(section.body, bodyFont, layout.contentWidth);
        // Body uses mutedForeground for visual hierarchy
        ctx.fillStyle = theme.mutedForeground;
        ctx.font = bodyFont;
        let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
        const bodyPrepared = prepareWithSegments(section.body, bodyFont, { whiteSpace: "pre-wrap" });
        while (true) {
          const line = layoutNextLine(bodyPrepared, bCursor, bodyW);
          if (line === null) break;
          const isEmpty = line.text.trim() === "";
          if (!isEmpty) ctx.fillText(line.text, layout.contentX, y);
          bCursor = line.end;
          y += isEmpty ? Math.round(bodyLH * TOKENS.paragraphGap) : bodyLH;
        }
      }
    }

    drawSlideCounter(ctx, theme, layout, slideNum, totalSlides);
    slides.push(canvas);
    slideNum++;
  }

  return slides;
}

// --- Main ---
function main() {
  // Parse args: node render.js <file> [--spacing sm|md|lg] [--output <dir>]
  const args = process.argv.slice(2);
  const inputFile = args.find(a => !a.startsWith("--"));
  if (!inputFile) {
    console.error("Usage: node render.js <content.json> [--spacing sm|md|lg] [--palette light|dark|warm|slate|paper|chalk] [--output <dir>]");
    process.exit(1);
  }

  const spacingIdx = args.indexOf("--spacing");
  const cliSpacing = spacingIdx !== -1 ? args[spacingIdx + 1] : null;

  const paletteIdx = args.indexOf("--palette");
  const cliPalette = paletteIdx !== -1 ? args[paletteIdx + 1] : null;

  const outputIdx = args.indexOf("--output");
  const cliOutput = outputIdx !== -1 ? args[outputIdx + 1] : "./output";

  tryRegisterFonts();

  const content = JSON.parse(fs.readFileSync(inputFile, "utf-8"));

  // Merge priority (low → high):
  //   TOKENS.theme defaults → palette colors → explicit color overrides in content.json
  // content.json "palette" key selects the palette; CLI --palette overrides that.
  // Only color keys explicitly set in content.json override the palette.
  const contentTheme = content.theme || {};
  const paletteName = cliPalette || contentTheme.palette || TOKENS.theme.palette;
  const palette = COLOR_PALETTES[paletteName] || COLOR_PALETTES.light;
  const COLOR_KEYS = ["background", "foreground", "mutedForeground", "subtleForeground", "accent"];
  const theme = {
    ...TOKENS.theme,
    ...palette,                // palette sets all color keys
    fontFamily: contentTheme.fontFamily || TOKENS.theme.fontFamily,
    spacing:    contentTheme.spacing    || TOKENS.theme.spacing,
    palette:    paletteName,
  };
  // Only apply explicit color overrides from content.json (not palette defaults)
  for (const key of COLOR_KEYS) {
    if (contentTheme[key]) theme[key] = contentTheme[key];
  }

  // CLI --spacing overrides content.json
  if (cliSpacing && SPACING_PRESETS[cliSpacing]) theme.spacing = cliSpacing;

  const layout = resolveLayout(theme);

  // Count content slides (dry run uses same measureSectionHeight with anti-widow widths)
  const bodyFont     = fontString("body", theme.fontFamily);
  const headlineFont = fontString("headline", theme.fontFamily);
  const bodyLH       = TOKENS.type.body.lineHeight;
  const headLH       = TOKENS.type.headline.lineHeight;
  const AVAILABLE_H  = layout.contentBottom - layout.contentTop;

  let dryCount = 0, dryUsed = 0, dryHas = false;
  for (const section of content.sections) {
    const secH = measureSectionHeight(section, headlineFont, bodyFont, headLH, bodyLH, layout);
    const gap = dryHas ? layout.sectionGap : 0;
    if (dryHas && dryUsed + gap + secH > AVAILABLE_H) {
      dryCount++;
      dryUsed = secH;
    } else {
      dryUsed += gap + secH;
      dryHas = true;
    }
  }
  if (dryHas) dryCount++;

  const totalSlides = 1 + dryCount + 1;

  const allSlides = [];
  allSlides.push(renderCover(content, theme, layout, totalSlides));
  allSlides.push(...renderContentSlides(content.sections, theme, layout, 2, totalSlides));
  allSlides.push(renderCTA(content, theme, layout, allSlides.length + 1, totalSlides));

  const outDir = path.resolve(cliOutput);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < allSlides.length; i++) {
    const num = String(i + 1).padStart(2, "0");
    fs.writeFileSync(path.join(outDir, `slide-${num}.png`), allSlides[i].toBuffer("image/png"));
  }

  console.log(`Rendered ${allSlides.length} slides → ${outDir}`);
}

main();
