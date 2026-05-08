#!/usr/bin/env node
import { createCanvas, registerFont, loadImage } from "canvas";
import { createHighlighter } from "shiki";
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import {
  COLOR_PALETTES,
  SPACING_PRESETS,
  TEMPLATE_REGISTRY,
  normalizeTemplateName,
  resolveLayout,
  resolveTemplate,
  resolveTemplateName,
  resolveThemeConfig,
  resolveThemeNumber,
  resolveTypography,
  TYPOGRAPHY_PRESETS,
  TYPOGRAPHY_SCALES,
} from "./render-config.js";
import { normalizeShikiLang, resolveShikiThemeName } from "./shiki-utils.js";
import {
  SEGMENT_PAD,
  SEGMENT_GAP,
  SEGMENT_RADIUS,
  normalizeBody,
  measureSectionHeight,
  renderSectionBody,
} from "./render-segments.js";
import {
  splitTableIntoChunks as splitTableIntoChunksTable,
  renderTableChunk as renderTableChunkTable,
  measureTableSegmentHeight as measureTableSegmentHeightTable,
} from "./render-table.js";
import {
  EMOJI_ASCII_FALLBACK,
  isEmoji,
  loadEmojiImage,
} from "./render-emoji.js";
import { loadSectionImage } from "./render-image.js";
import { planSectionPages, isSparsePage } from "./render-pagination.js";
import { composeBackgroundPatternPlan, deriveDeckIdentity, renderBackgroundPattern } from "./render-pattern.js";
import { renderCover } from "./render-cover.js";
import { parseMarkdown } from "./markdown-to-content.js";
const RENDER_DIR = path.dirname(fileURLToPath(import.meta.url));

// --- Shiki syntax highlighter (lazy, cached by theme) ---
const _shikiCache = {};
async function getShikiHighlighter(shikiTheme) {
  if (!_shikiCache[shikiTheme]) {
    _shikiCache[shikiTheme] = await createHighlighter({
      themes: [shikiTheme],
      langs: ["javascript", "typescript", "python", "rust", "go", "java", "c", "cpp", "html", "css", "json", "bash", "sql", "text"],
    });
  }
  return _shikiCache[shikiTheme];
}

function fitCodeChunk(ctx, text, curX, maxX) {
  let chunk = text;
  let width = ctx.measureText(chunk).width;
  if (curX + width <= maxX || curX === 0) {
    // Fits (or first char on line — always draw at least 1 char)
    if (curX + width > maxX) {
      // Binary search for max fitting length
      let lo = 1;
      let hi = chunk.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(chunk.slice(0, mid)).width + curX <= maxX) lo = mid;
        else hi = mid - 1;
      }
      chunk = chunk.slice(0, lo);
      width = ctx.measureText(chunk).width;
    }
    return { chunk, width };
  }
  return null;
}

function countWrappedCodeLines(ctx, line, maxWidth) {
  if (line.length === 0) return 1;

  let lines = 1;
  let curX = 0;
  for (let ci = 0; ci < line.length; ) {
    const fit = fitCodeChunk(ctx, line.slice(ci), curX, maxWidth);
    if (fit) {
      curX += fit.width;
      ci += fit.chunk.length;
    } else {
      lines += 1;
      curX = 0;
    }
  }
  return lines;
}

// Render Shiki-tokenized code onto canvas. Returns total height drawn.
async function renderCodeTokens(ctx, code, lang, x, y, maxWidth, paletteName, fontSize, lineHeight, theme = null) {
  const shikiTheme = resolveShikiThemeName(paletteName, theme?.codeTheme);
  try {
    const highlighter = await getShikiHighlighter(shikiTheme);
    const loadedLangs = highlighter.getLoadedLanguages();
    const safeLang = loadedLangs.includes(normalizeShikiLang(lang)) ? normalizeShikiLang(lang) : "text";
    const { tokens } = highlighter.codeToTokens(code, { lang: safeLang, theme: shikiTheme });

    const fm = TOKENS.fonts.mono;
    const font = `${fontSize}px "${fm.name}", ${fm.fallback}`;
    ctx.font = font;
    ctx.textBaseline = "top";

    let curY = y;
    for (const line of tokens) {
      // Wrap long lines: measure tokens and break when exceeding maxWidth.
      // Keep curX relative to the start of the current visual line so the
      // wrapping rule stays consistent with countWrappedCodeLines().
      let curX = 0;
      for (const token of line) {
        const color = token.color || theme?.foreground || "#888";
        const text = token.content;
        // Split by characters for wrapping
        for (let ci = 0; ci < text.length; ) {
          const fit = fitCodeChunk(ctx, text.slice(ci), curX, maxWidth);
          if (fit) {
            ctx.fillStyle = color;
            ctx.fillText(fit.chunk, x + curX, curY);
            curX += fit.width;
            ci += fit.chunk.length;
          } else {
            // Wrap to next line and retry the same token from the new line.
            curX = 0;
            curY += lineHeight;
          }
        }
      }
      curY += lineHeight;
    }
    return curY - y;
  } catch {
    // Fallback: plain monochrome render
    return null;
  }
}

// Measure code height accounting for line wrapping (used for both Shiki and fallback)
function measureCodeHeight(ctx, code, fontSize, lineHeight, maxWidth) {
  const fm = TOKENS.fonts.mono;
  const font = `${fontSize}px "${fm.name}", ${fm.fallback}`;
  ctx.save();
  ctx.font = font;
  const lines = code.split("\n");
  let totalH = 0;
  for (const line of lines) {
    totalH += countWrappedCodeLines(ctx, line, maxWidth) * lineHeight;
  }
  ctx.restore();
  return totalH;
}

function stripReadingText(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\((?:[^()\\]|\\.)*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^()\\]|\\.)*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectReadingText(value, acc = []) {
  if (value == null) return acc;
  if (typeof value === "string") {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReadingText(item, acc);
    return acc;
  }
  if (typeof value === "object") {
    if (typeof value.content === "string") acc.push(value.content);
    if (typeof value.headline === "string") acc.push(value.headline);
    if (typeof value.title === "string") acc.push(value.title);
    if (typeof value.subtitle === "string") acc.push(value.subtitle);
    if (typeof value.alt === "string") acc.push(value.alt);
    if (Array.isArray(value.header)) collectReadingText(value.header, acc);
    if (Array.isArray(value.rows)) collectReadingText(value.rows, acc);
  }
  return acc;
}

function estimateCoverKicker(content) {
  const fragments = [];
  collectReadingText(content?.sections ?? [], fragments);
  collectReadingText(content?.cta ?? "", fragments);
  collectReadingText(content?.tags ?? "", fragments);
  if (fragments.length === 0) {
    collectReadingText(content?.cover?.title ?? "", fragments);
    collectReadingText(content?.cover?.subtitle ?? "", fragments);
  }

  const text = stripReadingText(fragments.join("\n\n"));
  const charCount = [...text.replace(/\s+/g, "")].length;
  const safeCount = Math.max(charCount, 1);
  const minutes = Math.max(1, Math.round(safeCount / 480));
  return `全文 ${safeCount.toLocaleString("en-US")}字 · ${minutes}分钟阅读`;
}

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

// --- Design Tokens ---
const TOKENS = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  type: {
    title:    { size: 121, weight: "800",    lineHeight: 144 },
    subtitle: { size: 38,  weight: "normal", lineHeight: 58 },
    headline: { size: 58,  weight: "600",    lineHeight: 78 },
    body:     { size: 38,  weight: "normal", lineHeight: 57 },
    small:    { size: 25,  weight: "normal", lineHeight: 38 },
    code:     { size: 30,  weight: "normal", lineHeight: 48 },
  },
  paragraphGap: 0.25,
  fonts: {
    sans:  { name: "Helvetica Neue", fallback: "Helvetica, Arial, sans-serif" },
    serif: { name: "Georgia",        fallback: "Times New Roman, serif" },
    mono:  { name: "Menlo",          fallback: "Consolas, monospace" },
  },
  theme: {
    palette:    "light",
    fontFamily: "sans",
    spacing:    "md",
  },
};

// --- Font helpers ---
function fontString(typeKey, fontFamily) {
  const t = TOKENS.type[typeKey];
  const fm = TOKENS.fonts[fontFamily] || TOKENS.fonts.sans;
  const family = `"${fm.name}", ${fm.fallback}, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Apple Color Emoji"`;
  const w = t.weight === "normal" ? "" : t.weight + " ";
  return `${w}${t.size}px ${family}`;
}

function monoFontString(size) {
  const fm = TOKENS.fonts.mono;
  return `${size}px "${fm.name}", ${fm.fallback}, "Noto Sans Mono CJK SC", "Apple Color Emoji"`;
}

function scaleFontString(fontStr, scale) {
  return fontStr.replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${Math.round(Number(n) * scale)}px`);
}

function fitScaleToHeight(measureHeight, maxHeight, targetScale, minScale = 1) {
  let lo = minScale;
  let hi = targetScale;

  if (measureHeight(hi) <= maxHeight) return hi;
  if (measureHeight(lo) > maxHeight) return lo;

  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (measureHeight(mid) <= maxHeight) lo = mid;
    else hi = mid;
  }

  return lo;
}

// --- Font registration ---
const FONT_FILE_PATTERNS = [
  { pattern: "geistmono", family: "Geist Mono" },
  { pattern: "geist",     family: "Geist" },
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
function createSlideCanvas(theme, patternContext = {}) {
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
  let patternHandled = false;
  if (theme.easterEgg) {
    try {
      renderBackgroundPattern(ctx, theme, {
        width: W,
        height: H,
        monoFontName: TOKENS.fonts.mono.name,
      }, patternContext);
      patternHandled = true;
    } catch {
      patternHandled = false;
    }
  }
  if (!patternHandled && theme.pattern && theme.pattern !== "none") {
    const opacity = theme.patternOpacity ?? 0.08;
    const color = theme.patternColor ?? theme.foreground;
    const spacing = Number.isFinite(theme.patternSpacing) && theme.patternSpacing > 0 ? theme.patternSpacing : 48;
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

// --- Card background helper (callout + code blocks) ---
// Fills a rounded rect with cardBg solid color (or background + tint for dark themes),
// then strokes a subtle border. Call before drawing content on top.
function drawCardBg(ctx, theme, x, y, w, h, r = SEGMENT_RADIUS) {
  ctx.save();
  if (theme.cardBg) {
    ctx.fillStyle = theme.cardBg;
    ctx.globalAlpha = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.fillStyle = theme.background;
    ctx.globalAlpha = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.fillStyle = theme.foreground;
    ctx.globalAlpha = theme.cardTintFallback ?? theme.cardTint ?? 0.18;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }
  // Subtle border
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = theme.cardBorderAlpha ?? 0.1;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

// --- Rounded rectangle path helper ---
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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



const TABLE_RENDER_DEPS = {
  measureTextHeight,
  collectLines,
  drawCardBg,
  roundRect,
};

const measureTableSegmentHeight = (...args) => measureTableSegmentHeightTable(...args, TABLE_RENDER_DEPS);
const renderTableChunk = (...args) => renderTableChunkTable(...args, TABLE_RENDER_DEPS);

const SECTION_RENDER_DEPS = {
  TOKENS,
  antiWidowWidth,
  measureTextHeight,
  measureCodeHeight,
  measureTableSegmentHeight,
  isEmoji,
  resolveThemeNumber,
  prepareWithSegments,
  layoutNextLine,
  paragraphGap: TOKENS.paragraphGap,
  measureCtx: _measureCtx,
  renderCodeTokens,
  renderTableChunk,
  drawCardBg,
  roundRect,
  loadEmojiImage,
  fitCodeChunk,
  monoFontString,
  EMOJI_ASCII_FALLBACK,
};

function measureTopMetaHeight(section, imageH, headlineFont, bodyFont, headlineLineHeight, layout) {

  let h = 0;
  if (imageH > 0) {
    h += imageH + layout.headlineToBody;
  }
  if (section.headline) {
    const headW = antiWidowWidth(section.headline, headlineFont, layout.contentWidth);
    h += measureTextHeight(section.headline, headlineFont, headW, headlineLineHeight);
    h += layout.headlineToBody;
  }
  return h;
}

function finalizeChunkSection(section) {
  if (!section) return null;
  if (section.body && section.body.length === 0) delete section.body;
  if (!section.headline && !section.body && !section.image) return null;
  return section;
}

function collectTextLength(value) {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + collectTextLength(item), 0);
  if (typeof value === 'object') {
    let total = 0;
    for (const key of ['content', 'headline', 'title', 'subtitle', 'alt', 'kicker', 'cta']) {
      if (typeof value[key] === 'string') total += value[key].length;
    }
    if (Array.isArray(value.body)) total += collectTextLength(value.body);
    if (Array.isArray(value.rows)) total += collectTextLength(value.rows);
    if (Array.isArray(value.header)) total += collectTextLength(value.header);
    return total;
  }
  return 0;
}

function isDenseSection(section = {}) {
  const bodyBlocks = Array.isArray(section.body) ? section.body.length : section.body ? 1 : 0;
  const textLength = collectTextLength(section) + collectTextLength(section.body);
  return bodyBlocks >= 3 || textLength >= 1400;
}

function splitLongText(text, maxChars = 900) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = [];
  const paragraphs = normalized.split(/\n\s*\n/g);

  const splitSegment = (segment) => {
    const words = segment.split(/(\s+)/);
    let current = '';
    for (const token of words) {
      if (!token) continue;
      if (!current && token.length > maxChars) {
        for (let i = 0; i < token.length; i += maxChars) {
          chunks.push(token.slice(i, i + maxChars).trim());
        }
        continue;
      }
      if ((current + token).length > maxChars && current.trim()) {
        chunks.push(current.trim());
        current = token.trimStart();
      } else {
        current += token;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  };

  let current = '';
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    if (paragraph.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      splitSegment(paragraph);
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current.trim()) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitLinesBlock(content, maxLines = 6, maxChars = 900) {
  const lines = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const line of lines) {
    const nextChars = currentChars + line.length;
    if (current.length > 0 && (current.length >= maxLines || nextChars > maxChars)) {
      chunks.push(current.join('\n'));
      current = [];
      currentChars = 0;
    }
    current.push(line);
    currentChars += line.length;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
}

function splitBlockForCanvas(block) {
  if (!block) return [];
  if (typeof block === 'string') return [{ type: 'text', content: block }];

  switch (block.type) {
    case 'text':
      return splitLongText(block.content ?? '', 1100).map((content) => ({ type: 'text', content }));
    case 'callout':
      return splitLongText(block.content ?? '', 850).map((content) => ({ type: 'callout', content }));
    case 'list':
      return splitLinesBlock(block.content ?? '', 6, 900).map((content) => ({ type: 'list', content }));
    case 'code':
      return splitLinesBlock(block.content ?? '', 12, 1200).map((content) => ({
        type: 'code',
        lang: block.lang,
        content,
      }));
    default:
      return [block];
  }
}

function splitSectionForCanvas(section = {}) {
  const body = Array.isArray(section.body) ? section.body : section.body ? [section.body] : [];
  const dense = isDenseSection(section);
  const maxChars = dense ? 1300 : 2400;
  const slides = [];
  let current = { ...section, body: [] };
  let currentChars = collectTextLength(section.headline ?? '') + collectTextLength(section.imageAlt ?? '');

  const pushCurrent = () => {
    if (current.body.length > 0 || current.image || current.headline || current.body === '') {
      slides.push(current);
    }
  };

  for (const block of body) {
    const pieces = splitBlockForCanvas(block);
    for (const piece of pieces) {
      const pieceChars = collectTextLength(piece);
      if (current.body.length > 0 && currentChars + pieceChars > maxChars) {
        pushCurrent();
        current = { ...section, body: [], continued: true };
        currentChars = collectTextLength(section.headline ?? '') + collectTextLength(section.imageAlt ?? '');
      }
      current.body.push(piece);
      currentChars += pieceChars;
    }
  }

  pushCurrent();
  return slides.length > 0 ? slides : [{ ...section, body: [] }];
}

function expandSectionsForTables(sections, loadedImages, theme, layout, bodyFont, headlineFont, headlineLineHeight, bodyLineHeight) {
  const expanded = [];
  const availableHeight = layout.contentBottom - layout.contentTop;

  for (let si = 0; si < sections.length; si++) {
    const source = sections[si];
    const imgData = loadedImages[si] || null;
    const body = normalizeBody(source.body) || [];
    const hasTopMeta = Boolean(source.headline || imgData);
    const topMetaHeight = hasTopMeta
      ? measureTopMetaHeight(source, imgData?.drawH ?? 0, headlineFont, bodyFont, headlineLineHeight, layout)
      : 0;

    let current = { ...source, body: [] };
    let hasPrefixBody = false;
    let usedTopMeta = false;

    const flushCurrent = (noGap = false) => {
      const finalized = finalizeChunkSection(current);
      if (finalized) {
        const retainImage = Boolean(current.headline || current.image);
        expanded.push({ ...finalized, imgData: retainImage ? imgData : null, noGap });
        if (retainImage) usedTopMeta = true;
      }
      current = { body: [] };
      hasPrefixBody = false;
    };

    for (const seg of body) {
      if (seg.type !== "table") {
        current.body.push(seg);
        hasPrefixBody = true;
        continue;
      }

      const canUseTopMeta = hasTopMeta && !usedTopMeta && !hasPrefixBody;
      const firstMaxHeight = canUseTopMeta ? Math.max(0, availableHeight - topMetaHeight) : availableHeight;
      const chunks = splitTableIntoChunksTable(seg, _measureCtx, bodyFont, bodyLineHeight, layout.contentWidth, firstMaxHeight, availableHeight, TABLE_RENDER_DEPS);

      if (hasPrefixBody) {
        flushCurrent(false);
      }

      if (canUseTopMeta) {
        current.body.push(chunks[0]);
        usedTopMeta = true;
        flushCurrent(false);
        for (let ci = 1; ci < chunks.length; ci++) {
          expanded.push({ ...finalizeChunkSection({ body: [chunks[ci]] }), imgData: null, noGap: true });
        }
      } else {
        for (let ci = 0; ci < chunks.length; ci++) {
          expanded.push({ ...finalizeChunkSection({ body: [chunks[ci]] }), imgData: null, noGap: ci > 0 });
        }
      }
    }

    if (current.body.length > 0 || current.headline || current.image) {
      const finalized = finalizeChunkSection(current);
      if (finalized) {
        expanded.push({ ...finalized, imgData: !usedTopMeta ? imgData : null, noGap: false });
      }
    }
  }

  return expanded;
}

function applyEastereggPresentation(theme, plan) {
  const presentation = plan?.presentation;
  if (!presentation) return theme;

  const paletteName = presentation.palette ?? theme.palette;
  const palette = COLOR_PALETTES[paletteName] || null;
  const nextTheme = {
    ...theme,
    ...presentation,
    palette: paletteName,
  };

  if (palette) {
    for (const key of ["background", "backgroundGradient", "foreground", "mutedForeground", "subtleForeground", "accent", "cardBg", "cardTint"]) {
      if (palette[key] !== undefined) nextTheme[key] = palette[key];
    }
  }

  return nextTheme;
}

// --- Slide renderers ---
const COVER_RENDER_DEPS = {
  TOKENS,
  path,
  loadImage,
  fontString,
  antiWidowWidth,
  prepareWithSegments,
  layoutNextLine,
  createSlideCanvas,
  drawSlideCounter,
  createCanvas,
};

function renderCTA(content, theme, layout, slideNum, totalSlides, patternContext = {}) {
  const { canvas, ctx } = createSlideCanvas(theme, patternContext);
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

function resolveAssetPath(baseDir, assetPath) {
  if (!assetPath) return assetPath;
  if (path.isAbsolute(assetPath)) return assetPath;
  return path.resolve(baseDir, assetPath);
}

async function renderContentSlides(sections, theme, layout, startSlideNum, totalSlides, patternContext = {}) {
  const slides = [];
  const bodyFont = fontString("body", theme.fontFamily);
  const headlineFont = fontString("headline", theme.fontFamily);
  const bodyLH = TOKENS.type.body.lineHeight;
  const headLH = TOKENS.type.headline.lineHeight;
  const { sectionGap, headlineToBody } = layout;
  const AVAILABLE_H = layout.contentBottom - layout.contentTop;

  const codeFontSize = resolveThemeNumber(theme.codeFontSize, TOKENS.type.code.size);
  const codeLineHeight = resolveThemeNumber(theme.codeLineHeight, TOKENS.type.code.lineHeight);
  const codePadTop = resolveThemeNumber(theme.codePadTop, SEGMENT_PAD.code.top);
  const codePadBottom = resolveThemeNumber(theme.codePadBottom, SEGMENT_PAD.code.bottom);
  const codePadLeft = resolveThemeNumber(theme.codePadLeft, SEGMENT_PAD.code.left);
  const codePadRight = resolveThemeNumber(theme.codePadRight, SEGMENT_PAD.code.right);
  const codeStyle = {
    codeFontSize,
    codeLineHeight,
    codePadTop,
    codePadBottom,
    codePadLeft,
    codePadRight,
  };

  // Pre-load all section images
  // maxH: cap at contentWidth so 1:1 images fill full width; 16:9 / 4:3 are naturally shorter
  const loadedImages = sections.map((s) => s.imgData || null);

  const pages = planSectionPages(sections, {
    availableHeight: AVAILABLE_H,
    getSectionHeight: (section, si) => {
      const imgData = loadedImages[si];
      return measureSectionHeight(
        section,
        headlineFont,
        bodyFont,
        headLH,
        bodyLH,
        layout,
        codeStyle,
        imgData?.drawH ?? 0,
        SECTION_RENDER_DEPS,
      );
    },
    getSectionGap: (section) => (section.noGap ? 0 : sectionGap),
    getSectionImage: (section, si) => loadedImages[si],
  });

  let slideNum = startSlideNum;
  for (const pageIndices of pages) {
    // Sparse-slide fluid adaptation: measure content, then scale up typography for
    // sparse slides so the content fills the slide more fully before centering.
    let pageUsedH = 0;
    for (let i = 0; i < pageIndices.length; i++) {
      const si = pageIndices[i];
      const section = sections[si];
      const imgData = loadedImages[si];
      if (i > 0 && !section.noGap) pageUsedH += sectionGap;
      pageUsedH += measureSectionHeight(
        section, headlineFont, bodyFont, headLH, bodyLH,
        layout, codeStyle, imgData?.drawH ?? 0, SECTION_RENDER_DEPS,
      );
    }
    const pageIsTextOnly = pageIndices.every((si) => {
      const section = sections[si];
      const imgData = loadedImages[si];
      if (imgData) return false;
      const body = normalizeBody(section.body) || [];
      return body.every((seg) => seg.type === "text" || seg.type === "list");
    });
    const isSparse = isSparsePage(pageUsedH, AVAILABLE_H, 0.75);
    const canFluid = isSparse && pageIsTextOnly;
    console.log(`[sparse-layout-debug] slide=${slideNum} usedH=${pageUsedH} availH=${AVAILABLE_H} ratio=${(pageUsedH / AVAILABLE_H).toFixed(3)} canFluid=${canFluid}`);
    const sparseFillTarget = 0.88;
    const sparseScaleRaw = Math.min((AVAILABLE_H * sparseFillTarget) / pageUsedH, 1.75);
    const sparsePanelPadY = Math.round(Math.min(34, AVAILABLE_H * 0.02));
    const sparseFitMaxH = Math.max(0, AVAILABLE_H - 48 - (sparsePanelPadY * 2));
    const measureSparsePageHeight = (scale) => {
      const headlineScale = scale;
      const bodyScale = scale;
      const pgHeadlineFont = scale === 1 ? headlineFont : scaleFontString(headlineFont, headlineScale);
      const pgBodyFont = scale === 1 ? bodyFont : scaleFontString(bodyFont, bodyScale);
      const pgHeadLH = headLH;
      const pgBodyLH = bodyLH;
      const pgHeadlineToBody = headlineToBody;
      const pgSectionGap = sectionGap;
      const pgLayout = layout;
      const pgCodeStyle = scale === 1 ? codeStyle : {
        ...codeStyle,
        codeFontSize: Math.round(codeStyle.codeFontSize * bodyScale),
        codeLineHeight: codeStyle.codeLineHeight,
      };
      let h = 0;
      for (let i = 0; i < pageIndices.length; i++) {
        const si = pageIndices[i];
        const section = sections[si];
        const imgData = loadedImages[si];
        if (i > 0 && !section.noGap) h += pgSectionGap;
        h += measureSectionHeight(
          section, pgHeadlineFont, pgBodyFont, pgHeadLH, pgBodyLH,
          pgLayout, pgCodeStyle, imgData?.drawH ?? 0, SECTION_RENDER_DEPS,
        );
      }
      return h;
    };
    const sparseScaleTarget = canFluid ? Math.max(sparseScaleRaw, 1.35) : 1;
    const sparseScale = canFluid ? Math.min(fitScaleToHeight(measureSparsePageHeight, sparseFitMaxH, sparseScaleTarget, 1), 1.24) : 1;
    const headlineScale = sparseScale;
    const bodyScale = sparseScale;
    const pgHeadlineFont = sparseScale === 1 ? headlineFont : scaleFontString(headlineFont, headlineScale);
    const pgBodyFont = sparseScale === 1 ? bodyFont : scaleFontString(bodyFont, bodyScale);
    const pgHeadLH = headLH;
    const pgBodyLH = bodyLH;
    const pgHeadlineToBody = headlineToBody;
    const pgSectionGap = sectionGap;
    const pgLayout = layout;
    const pgCodeStyle = sparseScale === 1 ? codeStyle : {
      ...codeStyle,
      codeFontSize: Math.round(codeStyle.codeFontSize * bodyScale),
      codeLineHeight: codeStyle.codeLineHeight,
    };
    let scaledPageUsedH = pageUsedH;
    if (isSparse && sparseScale !== 1) {
      scaledPageUsedH = 0;
      for (let i = 0; i < pageIndices.length; i++) {
        const si = pageIndices[i];
        const section = sections[si];
        const imgData = loadedImages[si];
        if (i > 0 && !section.noGap) scaledPageUsedH += pgSectionGap;
        scaledPageUsedH += measureSectionHeight(
          section, pgHeadlineFont, pgBodyFont, pgHeadLH, pgBodyLH,
          pgLayout, pgCodeStyle, imgData?.drawH ?? 0, SECTION_RENDER_DEPS,
        );
      }
    }
    const sparseOffset = 0;

    const firstSection = sections[pageIndices[0]] || {};
    const pageTheme = firstSection.theme
      ? resolveThemeConfig({
          TOKENS,
          SEGMENT_PAD,
          contentTheme: {
            ...theme,
            ...firstSection.theme,
          },
          contentEasterEgg: firstSection.easterEgg ?? firstSection.theme?.easterEgg ?? theme.easterEgg,
        })
      : theme;
    const { canvas, ctx } = createSlideCanvas(pageTheme, patternContext);

    if (canFluid) {
      const panelPadX = Math.round(Math.min(44, layout.contentWidth * 0.05));
      const panelPadY = sparsePanelPadY;
      const panelX = Math.max(24, layout.contentX - panelPadX);
      const panelW = Math.min(TOKENS.canvas.width - panelX * 2, layout.contentWidth + panelPadX * 2);
      const panelY = Math.max(24, layout.contentTop + sparseOffset - panelPadY);
      const panelH = Math.min(AVAILABLE_H - 24 - panelY, scaledPageUsedH + panelPadY * 2);
      const panelR = 28;

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = pageTheme.card || pageTheme.background;
      ctx.globalAlpha = 0.58;
      ctx.strokeStyle = pageTheme.border || pageTheme.subtleForeground;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(panelX + panelR, panelY);
      ctx.lineTo(panelX + panelW - panelR, panelY);
      ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + panelR);
      ctx.lineTo(panelX + panelW, panelY + panelH - panelR);
      ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - panelR, panelY + panelH);
      ctx.lineTo(panelX + panelR, panelY + panelH);
      ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - panelR);
      ctx.lineTo(panelX, panelY + panelR);
      ctx.quadraticCurveTo(panelX, panelY, panelX + panelR, panelY);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      const glowY = panelY + Math.round(panelH * 0.24);
      const glow = ctx.createRadialGradient(TOKENS.canvas.width * 0.5, glowY, 0, TOKENS.canvas.width * 0.5, glowY, Math.max(panelW, panelH) * 0.72);
      glow.addColorStop(0, "rgba(255,255,255,0.10)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, TOKENS.canvas.width, TOKENS.canvas.height);
      ctx.restore();
    }

    let y = layout.contentTop + sparseOffset;

    for (let i = 0; i < pageIndices.length; i++) {
      const section = sections[pageIndices[i]];
      const imgData = loadedImages[pageIndices[i]];
      if (i > 0 && !section.noGap) y += pgSectionGap;

      // Image: draw above headline, scaled to fit
      if (imgData) {
        // Optional rounded corners via clip
        const radius = 16;
        const x = layout.contentX;
        const w = imgData.drawW;
        const h = imgData.drawH;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(imgData.img, imgData.srcX, imgData.srcY, imgData.srcW, imgData.srcH, x, y, w, h);
        ctx.restore();
        y += h + pgHeadlineToBody;
      }

      if (section.headline) {
        const headW = antiWidowWidth(section.headline, pgHeadlineFont, layout.contentWidth);
        ctx.fillStyle = pageTheme.foreground;
        ctx.font = pgHeadlineFont;
        let hCursor = { segmentIndex: 0, graphemeIndex: 0 };
        const headPrepared = prepareWithSegments(section.headline, pgHeadlineFont, { whiteSpace: "pre-wrap" });
        while (true) {
          const line = layoutNextLine(headPrepared, hCursor, headW);
          if (line === null) break;
          ctx.fillText(line.text, layout.contentX, y);
          hCursor = line.end;
          y += pgHeadLH;
        }
        y += pgHeadlineToBody;
      }

      y = await renderSectionBody({
        ctx,
        theme: pageTheme,
        layout: pgLayout,
        section,
        bodyFont: pgBodyFont,
        bodyLineHeight: pgBodyLH,
        codeStyle: pgCodeStyle,
        y,
        deps: SECTION_RENDER_DEPS,
      });
    }

    drawSlideCounter(ctx, pageTheme, layout, slideNum, totalSlides);
    slides.push(canvas);
    slideNum++;
  }

  return slides;
}


// --- Main ---
async function main() {
  // Parse args: node render.js <file> [--spacing sm|md|lg] [--output <dir>]
  const args = process.argv.slice(2);
  const printUsage = () => {
    console.error("Usage: node render.js <content.json|deck.md> [--template minimal|bold|technical] [--spacing sm|md|lg] [--type sm|md|lg|golden-ratio] [--palette light|dark|warm|slate|paper|teal|midnight|clay] [--output <dir>] [--json] [--easteregg] [--seed <value>] [--no-cover-kicker] [--help]");
  };

  const parseArgs = () => {
    let inputFile = null;
    let cliSpacing = null;
    let cliPalette = null;
    let cliType = null;
    let cliOutput = "./output";
    let cliNoCoverKicker = false;
    let cliEasterEgg = false;
    let cliSeed = null;
    let cliTemplate = null;
    let cliJson = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-h" || arg === "--help") {
        return { help: true };
      }
      if (arg === "--spacing" || arg === "--palette" || arg === "--output" || arg === "--seed" || arg === "--typography" || arg === "--type") {
        const value = args[i + 1];
        if (!value || value.startsWith("--")) {
          throw new Error(`Missing value for ${arg}`);
        }
        if (arg === "--spacing") cliSpacing = value;
        else if (arg === "--palette") cliPalette = value;
        else if (arg === "--typography" || arg === "--type") cliType = value;
        else if (arg === "--seed") cliSeed = value;
        else cliOutput = value;
        i++;
        continue;
      }
      if (arg === "--easteregg" || arg === "--easter-egg") {
        cliEasterEgg = true;
        continue;
      }
      if (arg === "--no-cover-kicker") {
        cliNoCoverKicker = true;
        continue;
      }
      if (arg === "--template") {
        const value = args[i + 1];
        if (!value || value.startsWith("--")) {
          throw new Error(`Missing value for ${arg}`);
        }
        cliTemplate = value;
        i++;
        continue;
      }
      if (arg === "--json") {
        cliJson = true;
        continue;
      }
      if (arg.startsWith("--")) {
        throw new Error(`Unknown option ${arg}`);
      }
      if (inputFile) {
        throw new Error(`Unexpected extra argument: ${arg}`);
      }
      inputFile = arg;
    }

    return { inputFile, cliSpacing, cliPalette, cliType, cliOutput, cliNoCoverKicker, cliEasterEgg, cliSeed, cliTemplate, cliJson };
  };


  let parsed;
  try {
    parsed = parseArgs();
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exit(1);
  }

  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  const { inputFile, cliSpacing, cliPalette, cliType, cliOutput, cliNoCoverKicker, cliEasterEgg, cliSeed, cliTemplate, cliJson } = parsed;
  if (!inputFile) {
    printUsage();
    process.exit(1);
  }
  if (cliTemplate !== null) {
    const VALID_TEMPLATES = ["minimal", "bold", "technical"];
    if (!VALID_TEMPLATES.includes(cliTemplate)) {
      console.error(`Invalid --template "${cliTemplate}". Use one of: ${VALID_TEMPLATES.join(", ")}.`);
      process.exit(2);
    }

    const resolvedInput = path.resolve(inputFile);
    let content;
    if (inputFile.endsWith(".md")) {
      const markdown = fs.readFileSync(resolvedInput, "utf8");
      content = parseMarkdown(markdown, resolvedInput);
    } else {
      content = JSON.parse(fs.readFileSync(resolvedInput, "utf8"));
    }
    if (!content.sourceDir) {
      content.sourceDir = path.dirname(resolvedInput);
    }

    const autoCoverKicker = estimateCoverKicker(content);
    const cover = content.cover || {};
    content.cover = {
      ...cover,
      kicker: (cliNoCoverKicker || cover.showKicker === false)
        ? null
        : (cover.kicker && String(cover.kicker).trim() ? cover.kicker : autoCoverKicker),
    };

    const { exportPreviewPng } = await import("./preview/export-png.mjs");
    const cssText = fs.readFileSync(path.resolve(RENDER_DIR, "preview", "preview.css"), "utf8");
    const outDir = path.resolve(cliOutput);

    let files;
    try {
      files = await exportPreviewPng(content, {
        sourcePath: resolvedInput,
        outputDir: outDir,
        cssText,
        template: cliTemplate,
      });
    } catch (err) {
      console.error(err);
      process.exit(3);
    }

    if (cliJson) {
      process.stdout.write(
        JSON.stringify({ slides: files, count: files.length, template: cliTemplate, output: outDir }) + "\n"
      );
    } else {
      console.error(`Rendered ${files.length} slides → ${outDir}`);
    }
    return;
  }

  if (cliSpacing !== null && !SPACING_PRESETS[cliSpacing]) {
    console.error(`Invalid --spacing "${cliSpacing}". Use sm, md, or lg.`);
    printUsage();
    process.exit(1);
  }
  if (cliPalette !== null && !COLOR_PALETTES[cliPalette]) {
    console.error(`Invalid --palette "${cliPalette}". Use one of: ${Object.keys(COLOR_PALETTES).join(", ")}.`);
    printUsage();
    process.exit(1);
  }

  const validTypeNames = [...Object.keys(TYPOGRAPHY_PRESETS), ...Object.keys(TYPOGRAPHY_SCALES)];
  if (cliType !== null && !validTypeNames.includes(cliType)) {
    console.error(`Invalid --type "${cliType}". Use one of: ${validTypeNames.join(", ")}.`);
    printUsage();
    process.exit(1);
  }

  tryRegisterFonts();

  const content = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const resolvedTemplate = resolveTemplate(resolveTemplateName(content));
  content.template = resolvedTemplate.name;
  if (content.boardStyle !== undefined) delete content.boardStyle;
  const patternContext = {
    deckIdentity: deriveDeckIdentity(content),
    templateName: resolvedTemplate.name,
  };
  const assetBaseDir = content.sourceDir ? path.resolve(content.sourceDir) : path.dirname(path.resolve(inputFile));
  const cover = content.cover || {};
  const autoCoverKicker = estimateCoverKicker(content);
  content.cover = {
    ...cover,
    coverImage: resolveAssetPath(assetBaseDir, cover.coverImage),
    kicker: (cliNoCoverKicker || cover.showKicker === false)
      ? null
      : (cover.kicker && String(cover.kicker).trim() ? cover.kicker : autoCoverKicker),
  };
  content.sections = (content.sections || []).map((section) => (
    section.image ? { ...section, image: resolveAssetPath(assetBaseDir, section.image) } : section
  ));

  // Merge priority (low → high):
  const contentTheme = content.theme || {};
  let theme = resolveThemeConfig({
    TOKENS,
    SEGMENT_PAD,
    contentTheme,
    contentEasterEgg: content.easterEgg,
    cliPalette,
    cliSpacing,
    cliType,
    cliEasterEgg,
    cliSeed,
  });

  TOKENS.type = theme.resolvedType || TOKENS.type;

  if (theme.easterEgg) {
    const remixPlan = composeBackgroundPatternPlan(theme, theme.easterEgg, patternContext);
    if (remixPlan?.mode === "random-patterns" && remixPlan.presentation) {
      theme = applyEastereggPresentation(theme, remixPlan);
      theme.easterEggPlan = remixPlan;
    } else {
      theme = {
        ...theme,
        easterEgg: null,
        easterEggPlan: null,
      };
    }
  }

  const layout = resolveLayout(theme, resolvedTemplate, TOKENS);

  // Pre-load images for dry-run height estimation
  const bodyFont     = fontString("body", theme.fontFamily);
  const headlineFont = fontString("headline", theme.fontFamily);
  const bodyLH       = TOKENS.type.body.lineHeight;
  const headLH       = TOKENS.type.headline.lineHeight;
  const AVAILABLE_H  = layout.contentBottom - layout.contentTop;

  const codeStyle = {
    codeFontSize: theme.codeFontSize,
    codeLineHeight: theme.codeLineHeight,
    codePadTop: theme.codePadTop,
    codePadBottom: theme.codePadBottom,
    codePadLeft: theme.codePadLeft,
    codePadRight: theme.codePadRight,
  };

  const loadedImages = await Promise.all(
    content.sections.map(s => s.image ? loadSectionImage(s.image, layout.contentWidth, layout.contentWidth, s.imageAspect ?? "free", s.imagePosition ?? "top") : Promise.resolve(null))
  );

  const expandedSections = expandSectionsForTables(content.sections, loadedImages, theme, layout, bodyFont, headlineFont, headLH, bodyLH);
  const sections = expandedSections.flatMap((section) => splitSectionForCanvas(section));

  const pages = planSectionPages(sections, {
    availableHeight: AVAILABLE_H,
    getSectionHeight: (section, si) => {
      const imgData = sections[si].imgData;
      return measureSectionHeight(
        section,
        headlineFont,
        bodyFont,
        headLH,
        bodyLH,
        layout,
        codeStyle,
        imgData?.drawH ?? 0,
        SECTION_RENDER_DEPS,
      );
    },
    getSectionGap: (section) => (section.noGap ? 0 : layout.sectionGap),
    getSectionImage: (section) => section.imgData,
  });

  const hasCTA = Boolean(content.cta && content.cta.trim());
  const totalSlides = 1 + pages.length + (hasCTA ? 1 : 0);

  const coverTheme = content.cover?.theme
    ? resolveThemeConfig({
        TOKENS,
        SEGMENT_PAD,
        contentTheme: {
          ...theme,
          ...content.cover.theme,
        },
        contentEasterEgg: content.cover.easterEgg ?? content.cover.theme?.easterEgg ?? theme.easterEgg,
      })
    : theme;

  const allSlides = [];
  allSlides.push(await renderCover(content, coverTheme, layout, totalSlides, resolvedTemplate, { ...COVER_RENDER_DEPS, patternContext }));
  allSlides.push(...await renderContentSlides(sections, theme, layout, 2, totalSlides, patternContext));
  if (hasCTA) {
    allSlides.push(renderCTA(content, theme, layout, allSlides.length + 1, totalSlides, patternContext));
  }

  const outDir = path.resolve(cliOutput);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < allSlides.length; i++) {
    const num = String(i + 1).padStart(2, "0");
    fs.writeFileSync(path.join(outDir, `slide-${num}.png`), allSlides[i].toBuffer("image/png"));
  }

  console.log(`Rendered ${allSlides.length} slides → ${outDir}`);
}

const entryPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : null;
if (entryPath && pathToFileURL(entryPath).href === import.meta.url) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { fitCodeChunk, countWrappedCodeLines, measureCodeHeight, estimateCoverKicker, TEMPLATE_REGISTRY, resolveTemplateName, resolveTemplate };
