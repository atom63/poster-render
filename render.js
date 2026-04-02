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
    background:      "#FEFCE8",
    backgroundGradient: ["#FEFCE8", "#FEF08A"],
    foreground:      "#1A1400",
    mutedForeground: "#7A6E20",
    subtleForeground:"#B8AA50",
    accent:          "#1A1400",
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
    background:      "#FDF6ED",
    foreground:      "#1A0E00",
    mutedForeground: "#8A5A20",
    subtleForeground:"#C49A60",
    accent:          "#1A0E00",
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
  const W = TOKENS.canvas.width;
  const H = TOKENS.canvas.height;

  // Background (solid or gradient)
  if (theme.backgroundGradient && theme.backgroundGradient.length >= 2) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    theme.backgroundGradient.forEach((color, i) => grad.addColorStop(i / (theme.backgroundGradient.length - 1), color));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = theme.background;
  }
  ctx.fillRect(0, 0, W, H);

  // Background pattern overlay with optional gradient mask
  if (theme.pattern && theme.pattern !== "none") {
    const opacity = theme.patternOpacity ?? 0.08;
    const color = theme.patternColor ?? theme.foreground;
    const spacing = theme.patternSpacing ?? 48;
    const cx = W / 2;
    const cy = H / 2;
    const offsetX = cx % spacing;
    const offsetY = cy % spacing;

    // Draw pattern onto offscreen canvas
    const patCanvas = createCanvas(W, H);
    const pctx = patCanvas.getContext("2d");
    pctx.fillStyle = color;
    pctx.strokeStyle = color;

    if (theme.pattern === "dot-grid") {
      const r = theme.patternDotSize ?? 1.5;
      for (let x = offsetX; x < W; x += spacing) {
        for (let y = offsetY; y < H; y += spacing) {
          pctx.beginPath();
          pctx.arc(x, y, r, 0, Math.PI * 2);
          pctx.fill();
        }
      }

    } else if (theme.pattern === "line-grid") {
      pctx.lineWidth = 0.75;
      for (let x = offsetX; x < W; x += spacing) {
        pctx.beginPath(); pctx.moveTo(x, 0); pctx.lineTo(x, H); pctx.stroke();
      }
      for (let y = offsetY; y < H; y += spacing) {
        pctx.beginPath(); pctx.moveTo(0, y); pctx.lineTo(W, y); pctx.stroke();
      }

    } else if (theme.pattern === "diagonal") {
      pctx.lineWidth = 0.75;
      const diagOffset = (cx - cy) % spacing;
      for (let i = diagOffset - H; i < W + H; i += spacing) {
        pctx.beginPath(); pctx.moveTo(i, 0); pctx.lineTo(i + H, H); pctx.stroke();
      }

    } else if (theme.pattern === "halftone") {
      // Halftone: fine grid, dot size varies linearly
      // patternShape: "circle" (default) | "square"
      // patternBlend: composite op, e.g. "screen" | "overlay" | "multiply" | "source-over"
      const maxR    = theme.patternDotSize ?? 5;
      const minR    = 0.3;
      const dir     = theme.patternHalftoneDir ?? "vertical";
      const htSpace = theme.patternSpacing ?? 16;
      const shape   = theme.patternShape ?? "circle";
      const htOffX  = cx % htSpace;
      const htOffY  = cy % htSpace;

      for (let x = htOffX; x < W; x += htSpace) {
        for (let y = htOffY; y < H; y += htSpace) {
          let t;
          if (dir === "horizontal")    t = x / W;
          else if (dir === "diagonal") t = (x / W + y / H) / 2;
          else                         t = y / H;
          const r = minR + (maxR - minR) * t;
          if (r < 0.2) continue;
          if (shape === "square") {
            const s = r * 1.8; // square side ≈ circle area
            pctx.fillRect(x - s / 2, y - s / 2, s, s);
          } else {
            pctx.beginPath();
            pctx.arc(x, y, r, 0, Math.PI * 2);
            pctx.fill();
          }
        }
      }

    } else if (theme.pattern === "dither") {
      // Bayer 4x4 ordered dither — fills canvas with noise texture
      const bayer4 = [
        [ 0,  8,  2, 10],
        [12,  4, 14,  6],
        [ 3, 11,  1,  9],
        [15,  7, 13,  5],
      ];
      const cellSize = theme.patternSpacing ?? 3; // pixel size per dither cell
      const threshold = theme.patternThreshold ?? 0.45; // 0–1, density of dots
      for (let px = 0; px < W; px += cellSize) {
        for (let py = 0; py < H; py += cellSize) {
          const bx = Math.floor(px / cellSize) % 4;
          const by = Math.floor(py / cellSize) % 4;
          if (bayer4[by][bx] / 16 < threshold) {
            pctx.fillRect(px, py, cellSize, cellSize);
          }
        }
      }

    } else if (theme.pattern === "ascii") {
      // ASCII grid: fill background with characters, with optional random variation
      const chars = theme.patternChars ?? "10 ·∙ □■";
      const fontSize = theme.patternFontSize ?? 18;
      const charSpacingX = theme.patternSpacing ?? 28;
      const charSpacingY = Math.round(charSpacingX * 1.5);
      const vary = theme.patternVary ?? true; // random char selection when true
      pctx.font = `${fontSize}px "${TOKENS.fonts.mono.name}", monospace`;
      pctx.textBaseline = "top";
      const oX = cx % charSpacingX;
      const oY = cy % charSpacingY;
      // Simple LCG for deterministic randomness
      let s2 = 9301;
      const rand2 = () => { s2 = (s2 * 49297 + 233280) % 233280; return s2 / 233280; };
      let row = 0;
      for (let y = oY; y < H; y += charSpacingY) {
        let col = 0;
        for (let x = oX; x < W; x += charSpacingX) {
          const ch = vary
            ? chars[Math.floor(rand2() * chars.length)]
            : chars[(row + col) % chars.length];
          pctx.fillText(ch, x, y);
          col++;
        }
        row++;
      }

    } else if (theme.pattern === "paper") {
      // Paper texture: uniform fine grain — consistent alpha, no blotches
      const lcg = (s) => (s * 1664525 + 1013904223) & 0xffffffff;
      let s = 42;
      const rand = () => { s = lcg(s); return (s >>> 0) / 0xffffffff; };

      // Primary: fine horizontal fibers, short + thin
      const fiberCount = theme.patternStrokes ?? 36000;
      pctx.globalAlpha = 0.13;
      for (let i = 0; i < fiberCount; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const len = 15 + rand() * 66;
        const angle = (rand() - 0.5) * 0.10; // nearly perfectly horizontal
        pctx.lineWidth = 0.1 + rand() * 0.18; // very thin
        pctx.beginPath();
        pctx.moveTo(x, y);
        pctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        pctx.stroke();
      }

      // Ultra-fine grain dots
      const dotCount = theme.patternDots ?? 12000;
      pctx.globalAlpha = 0.12;
      for (let i = 0; i < dotCount; i++) {
        const x = rand() * W;
        const y = rand() * H;
        pctx.beginPath();
        pctx.arc(x, y, 0.15 + rand() * 0.25, 0, Math.PI * 2);
        pctx.fill();
      }

      pctx.globalAlpha = 1;
    }

    // Apply gradient mask via destination-in
    // patternMask: "top" | "bottom" | "left" | "right" | "center-v" | "center-h" | "radial" | "none"
    const maskDir = theme.patternMask ?? "bottom";
    if (maskDir !== "none") {
      pctx.globalCompositeOperation = "destination-in";

      if (maskDir === "noise") {
        // Value noise mask: smooth organic irregular fade
        const noiseScale = theme.patternNoiseScale ?? 300; // lower = larger blobs
        const noiseCanvas = createCanvas(W, H);
        const nctx = noiseCanvas.getContext("2d");
        const imgData = nctx.createImageData(W, H);
        // Simple value noise: interpolate between random values on a coarse grid
        const gridW = Math.ceil(W / noiseScale) + 2;
        const gridH = Math.ceil(H / noiseScale) + 2;
        // Seed grid
        const grid = [];
        let ns = 13371337;
        const nrand = () => { ns = (ns * 1664525 + 1013904223) & 0xffffffff; return (ns >>> 0) / 0xffffffff; };
        for (let gy = 0; gy < gridH; gy++) {
          grid.push([]);
          for (let gx = 0; gx < gridW; gx++) grid[gy].push(nrand());
        }
        const lerp = (a, b, t) => a + (b - a) * t;
        const smoothstep = (t) => t * t * (3 - 2 * t);
        for (let py = 0; py < H; py++) {
          for (let px = 0; px < W; px++) {
            const gx = px / noiseScale;
            const gy = py / noiseScale;
            const ix = Math.floor(gx), iy = Math.floor(gy);
            const fx = smoothstep(gx - ix), fy = smoothstep(gy - iy);
            const v = lerp(
              lerp(grid[iy][ix], grid[iy][ix+1], fx),
              lerp(grid[iy+1][ix], grid[iy+1][ix+1], fx),
              fy
            );
            const idx = (py * W + px) * 4;
            const alpha = Math.round(v * 255);
            imgData.data[idx]   = 0;
            imgData.data[idx+1] = 0;
            imgData.data[idx+2] = 0;
            imgData.data[idx+3] = alpha;
          }
        }
        nctx.putImageData(imgData, 0, 0);
        pctx.drawImage(noiseCanvas, 0, 0);
      } else if (maskDir === "radial") {
        // Radial: full opacity at center, fades to transparent at edges
        // Radius covers most of the canvas so more pattern is visible
        // Radius = half the shorter side so fade is clearly visible inside canvas
        const radius = Math.min(W, H) * 0.55;
        const grad = pctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0,   "rgba(0,0,0,1)");
        grad.addColorStop(0.4, "rgba(0,0,0,1)");
        grad.addColorStop(1,   "rgba(0,0,0,0)");
        pctx.fillStyle = grad;
      } else if (maskDir === "center-v") {
        // Vertical: full in middle 60%, fade only at top/bottom edges
        const grad = pctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,   "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,1)");
        grad.addColorStop(1,   "rgba(0,0,0,0)");
        pctx.fillStyle = grad;
      } else if (maskDir === "center-h") {
        const grad = pctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0,   "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,1)");
        grad.addColorStop(1,   "rgba(0,0,0,0)");
        pctx.fillStyle = grad;
      } else {
        // Directional linear: full → transparent
        let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
        if      (maskDir === "bottom") { x0=0; y0=0;  x1=0; y1=H; }
        else if (maskDir === "top")    { x0=0; y0=H;  x1=0; y1=0; }
        else if (maskDir === "right")  { x0=0; y0=0;  x1=W; y1=0; }
        else if (maskDir === "left")   { x0=W; y0=0;  x1=0; y1=0; }
        const grad = pctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        pctx.fillStyle = grad;
      }

      pctx.fillRect(0, 0, W, H);
    }

    // Composite pattern onto main canvas
    // patternBlend: "source-over"(default) | "screen" | "overlay" | "multiply" | "soft-light" | "hard-light"
    const blendMode = theme.patternBlend ?? "source-over";
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendMode;
    ctx.drawImage(patCanvas, 0, 0);
    ctx.restore();
  }

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
    ...contentTheme,           // all content.json theme keys (pattern, spacing, fontFamily, etc.)
    palette: paletteName,      // lock palette name
  };
  // Re-apply palette colors for any color key NOT explicitly set in content.json
  for (const key of COLOR_KEYS) {
    if (!contentTheme[key]) theme[key] = palette[key];
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
