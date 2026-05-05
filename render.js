#!/usr/bin/env node
import { createCanvas, registerFont, loadImage } from "canvas";
import { createHighlighter } from "shiki";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

// --- Twemoji PNG rendering for emoji (node-canvas/Cairo can't render color emoji) ---
const EMOJI_CACHE_DIR = path.resolve("emoji-cache");

// Regex to detect emoji characters (covers most common emoji ranges)
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;

function isEmoji(str) {
  return EMOJI_RE.test(str);
}

function emojiToCDNUrl(emoji) {
  const codepoints = [...emoji]
    .map(c => c.codePointAt(0).toString(16))
    .filter(cp => cp !== "fe0f")
    .join("-");
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoints}.png`;
}

// ASCII fallback mapping for when emoji download fails
const EMOJI_ASCII_FALLBACK = {
  "💡": "»", "⚠️": "!", "❗": "!", "‼️": "!!",
  "✅": "✓", "❌": "✗", "🔥": "▲", "📌": "•",
  "📝": "#", "🚀": ">", "💬": ">", "🔑": "*",
  "ℹ️": "i", "⛔": "×", "🛑": "×", "👉": "→",
  "✨": "*", "🎯": "○", "📎": "·", "🔗": "@",
};

const _emojiImageCache = {};

async function loadEmojiImage(emoji) {
  if (_emojiImageCache[emoji]) return _emojiImageCache[emoji];
  if (!fs.existsSync(EMOJI_CACHE_DIR)) fs.mkdirSync(EMOJI_CACHE_DIR, { recursive: true });

  const codepoints = [...emoji]
    .map(c => c.codePointAt(0).toString(16))
    .filter(cp => cp !== "fe0f")
    .join("-");
  const cachePath = path.join(EMOJI_CACHE_DIR, `${codepoints}.png`);

  if (!fs.existsSync(cachePath)) {
    const url = emojiToCDNUrl(emoji);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(cachePath, buf);
    } catch (e) {
      console.warn(`Failed to download emoji ${emoji}: ${e.message}`);
      return null;
    }
  }

  try {
    const img = await loadImage(cachePath);
    _emojiImageCache[emoji] = img;
    return img;
  } catch {
    return null;
  }
}

// --- Shiki syntax highlighter (lazy, cached by theme) ---
const _shikiCache = {};
const PALETTE_TO_SHIKI = {
  dark: "github-dark",
  midnight: "github-dark",
  slate: "github-dark",
  teal: "github-light",
  light: "github-light",
  paper: "github-light",
  warm: "github-light",
};
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
async function renderCodeTokens(ctx, code, lang, x, y, maxWidth, paletteName, fontSize, lineHeight) {
  const shikiTheme = PALETTE_TO_SHIKI[paletteName] || "github-dark";
  try {
    const highlighter = await getShikiHighlighter(shikiTheme);
    const loadedLangs = highlighter.getLoadedLanguages();
    const safeLang = loadedLangs.includes(lang) ? lang : "text";
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
        const color = token.color || "#888";
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
    cardBg:          "#F0F0EE", // subtle grey card for light bg
    cardTint:        null,
  },
  dark: {
    background:      "#09090B",
    foreground:      "#FAFAF8",
    mutedForeground: "#A1A1AA",
    subtleForeground:"#52525B",
    accent:          "#FAFAF8",
    cardBg:          "#2A2A2F",
    cardTint:        null,
  },
  warm: {
    background:      "#FEFCE8",
    backgroundGradient: ["#FEFCE8", "#FEF08A"],
    foreground:      "#1A1400",
    mutedForeground: "#7A6E20",
    subtleForeground:"#B8AA50",
    accent:          "#1A1400",
    cardBg:          "#F5EDB8", // warm yellow tinted card
    cardTint:        null,
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
  },
  paper: {
    background:      "#FDF6ED",
    foreground:      "#1A0E00",
    mutedForeground: "#8A5A20",
    subtleForeground:"#C49A60",
    accent:          "#1A0E00",
    cardBg:          "#F0E5D0", // warm parchment card
    cardTint:        null,
  },
  teal: {
    background:      "#E8F5F3",
    foreground:      "#0D2B27",
    mutedForeground: "#4A8C82",
    subtleForeground:"#8ABDB6",
    accent:          "#0D2B27",
    cardBg:          "#F0FAF8", // very light teal card
    cardTint:        null,
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
    code:     { size: 30,  weight: "normal", lineHeight: 48 },
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

function resolveThemeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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
  const family = `"${fm.name}", ${fm.fallback}, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Apple Color Emoji"`;
  const w = t.weight === "normal" ? "" : t.weight + " ";
  return `${w}${t.size}px ${family}`;
}

function monoFontString(size) {
  const fm = TOKENS.fonts.mono;
  return `${size}px "${fm.name}", ${fm.fallback}, "Noto Sans Mono CJK SC", "Apple Color Emoji"`;
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
    ctx.globalAlpha = theme.cardTint ?? 0.18;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }
  // Subtle border
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = 0.1;
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

// --- Normalize body to segments array (backward compat) ---
function normalizeBody(body) {
  if (!body) return null;
  if (Array.isArray(body)) return body;
  // Legacy string format → single text segment
  return [{ type: "text", content: body }];
}

// Segment padding constants
const SEGMENT_PAD = {
  callout: { top: 20, bottom: 20, left: 27, right: 16, borderWidth: 3 }, // left = border(3) + gap(24)
  code:    { top: 10, bottom: 4, left: 14, right: 14 },
  table:   { top: 14, bottom: 14, left: 16, right: 16, cellX: 12, cellY: 9, grid: 1 },
};
const SEGMENT_GAP = 16; // vertical gap between segments
const SEGMENT_RADIUS = 12;

// --- Section height (uses anti-widow width for accuracy) ---
// options: optional code style overrides and imageH is pre-loaded image height for layout
function measureSectionHeight(
  section,
  headlineFont,
  bodyFont,
  headlineLineHeight,
  bodyLineHeight,
  layout,
  options = {},
  imageH = 0
) {
  const codePadTop = resolveThemeNumber(options.codePadTop, SEGMENT_PAD.code.top);
  const codePadBottom = resolveThemeNumber(options.codePadBottom, SEGMENT_PAD.code.bottom);
  const codePadLeft = resolveThemeNumber(options.codePadLeft, SEGMENT_PAD.code.left);
  const codePadRight = resolveThemeNumber(options.codePadRight, SEGMENT_PAD.code.right);
  const codeFontSize = resolveThemeNumber(options.codeFontSize, TOKENS.type.code.size);
  const codeLineHeight = resolveThemeNumber(options.codeLineHeight, TOKENS.type.code.lineHeight);

  let h = 0;
  // Image: full-width, plus gap below
  if (imageH > 0) {
    h += imageH + layout.headlineToBody;
  }
  if (section.headline) {
    const hw = antiWidowWidth(section.headline, headlineFont, layout.contentWidth);
    h += measureTextHeight(section.headline, headlineFont, hw, headlineLineHeight);
    h += layout.headlineToBody;
  }
  const segments = normalizeBody(section.body);
  if (segments) {
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (si > 0) h += SEGMENT_GAP;

      if (seg.type === "callout") {
        const pad = SEGMENT_PAD.callout;
        const emojiSize = Math.round(TOKENS.type.body.size * 1.2);
        const emojiGap = 8;
        const hasEmojiImg = seg.emoji && isEmoji(seg.emoji);
        const emojiOffset = hasEmojiImg ? emojiSize + emojiGap : 0;
        const innerW = layout.contentWidth - pad.left - pad.right - emojiOffset;
        const displayText = (!hasEmojiImg && seg.emoji ? seg.emoji + " " : "") + seg.content;
        const textH = measureTextHeight(displayText, bodyFont, innerW, bodyLineHeight);
        const minH = hasEmojiImg ? Math.max(textH, emojiSize) : textH;
        h += pad.top + minH + pad.bottom;
      } else if (seg.type === "code") {
        const innerW = layout.contentWidth - codePadLeft - codePadRight;
        const textH = measureCodeHeight(_measureCtx, seg.content, codeFontSize, codeLineHeight, innerW);
        h += codePadTop + textH + codePadBottom;
      } else if (seg.type === "table") {
        const tableH = measureTableSegmentHeight(_measureCtx, seg, bodyFont, bodyLineHeight, layout.contentWidth);
        h += tableH;
      } else {
        // text or list — same as before
        const bw = antiWidowWidth(seg.content, bodyFont, layout.contentWidth);
        const prepared = prepareWithSegments(seg.content, bodyFont, { whiteSpace: "pre-wrap" });
        let cursor = { segmentIndex: 0, graphemeIndex: 0 };
        while (true) {
          const line = layoutNextLine(prepared, cursor, bw);
          if (line === null) break;
          const isEmpty = line.text.trim() === "";
          h += isEmpty ? Math.round(bodyLineHeight * TOKENS.paragraphGap) : bodyLineHeight;
          cursor = line.end;
        }
      }
    }
  }
  return h;
}

function tableCellText(value) {
  return value == null ? "" : String(value);
}

function fitTableColumnWidths(preferredWidths, availableWidth) {
  if (preferredWidths.length === 0) return [];
  const totalPreferred = preferredWidths.reduce((sum, width) => sum + width, 0);
  if (totalPreferred <= availableWidth) return preferredWidths;

  const minWidth = Math.max(56, Math.floor(availableWidth / preferredWidths.length));
  let widths = preferredWidths.map((width) => Math.max(minWidth, Math.floor(width * availableWidth / totalPreferred)));
  let total = widths.reduce((sum, width) => sum + width, 0);

  if (total > availableWidth) {
    widths = Array.from({ length: preferredWidths.length }, (_, index) => {
      const base = Math.floor(availableWidth / preferredWidths.length);
      return base + (index < availableWidth % preferredWidths.length ? 1 : 0);
    });
    total = widths.reduce((sum, width) => sum + width, 0);
  }

  while (total < availableWidth) {
    for (let i = 0; i < widths.length && total < availableWidth; i++) {
      widths[i]++;
      total++;
    }
  }

  return widths;
}

function measureTableLayout(ctx, table, font, lineHeight, maxWidth) {
  const pad = SEGMENT_PAD.table;
  const rows = [table.header || [], ...(table.rows || [])];
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const grid = pad.grid;
  const availableForColumns = Math.max(0, maxWidth - pad.left - pad.right - grid * (columnCount + 1));

  const preferredWidths = Array.from({ length: columnCount }, (_, col) => {
    let width = 0;
    for (const row of rows) {
      ctx.font = font;
      width = Math.max(width, ctx.measureText(tableCellText(row[col])).width);
    }
    return Math.ceil(width) + pad.cellX * 2;
  });

  const widths = fitTableColumnWidths(preferredWidths, availableForColumns);
  const innerWidths = widths.map((width) => Math.max(0, width - pad.cellX * 2));
  const rowHeights = rows.map((row) => {
    let maxHeight = lineHeight;
    for (let col = 0; col < columnCount; col++) {
      const text = tableCellText(row[col]);
      const cellHeight = measureTextHeight(text, font, Math.max(1, innerWidths[col]), lineHeight);
      maxHeight = Math.max(maxHeight, cellHeight);
    }
    return maxHeight + pad.cellY * 2;
  });

  const headerHeight = rowHeights[0] ?? lineHeight + pad.cellY * 2;
  const bodyHeights = rowHeights.slice(1);
  const totalHeight = pad.top + headerHeight + grid + bodyHeights.reduce((sum, height) => sum + grid + height, pad.bottom);

  return {
    pad,
    grid,
    widths,
    innerWidths,
    headerHeight,
    rowHeights: bodyHeights,
    totalHeight,
    columnCount,
  };
}

function splitTableIntoChunks(table, ctx, font, lineHeight, maxWidth, firstMaxHeight, nextMaxHeight) {
  const layout = measureTableLayout(ctx, table, font, lineHeight, maxWidth);
  const chunks = [];
  const rows = table.rows || [];
  let start = 0;
  let chunkLimit = Math.max(1, firstMaxHeight);

  if (rows.length === 0) {
    return [{
      type: "table",
      header: table.header || [],
      rows: [],
      alignments: table.alignments || [],
      _tableLayout: layout,
    }];
  }

  while (start < rows.length) {
    let end = start;
    let chunkHeight = layout.pad.top + layout.headerHeight + layout.grid + layout.pad.bottom;
    while (end < rows.length) {
      const nextHeight = layout.rowHeights[end] + layout.grid;
      if (end > start && chunkHeight + nextHeight > chunkLimit) break;
      if (end === start && chunkHeight + nextHeight > chunkLimit) {
        chunkHeight += nextHeight;
        end++;
        break;
      }
      chunkHeight += nextHeight;
      end++;
    }
    chunks.push({
      type: "table",
      header: table.header || [],
      rows: rows.slice(start, end),
      alignments: table.alignments || [],
      _tableLayout: layout,
    });
    start = end;
    chunkLimit = nextMaxHeight;
  }

  return chunks;
}

function renderTableChunk(ctx, theme, layout, table, x, y, maxWidth, font, lineHeight) {
  const tableLayout = table._tableLayout || measureTableLayout(ctx, table, font, lineHeight, maxWidth);
  const { pad, grid, widths, innerWidths } = tableLayout;
  const allRows = [table.header || [], ...(table.rows || [])];
  const rowHeights = [tableLayout.headerHeight, ...tableLayout.rowHeights];
  const tableHeight = pad.top + rowHeights[0] + grid + rowHeights.slice(1).reduce((sum, height) => sum + grid + height, pad.bottom);
  const contentHeight = Math.max(0, tableHeight - pad.bottom);

  // Draw only the actual card content area; reserve pad.bottom as page background space.
  drawCardBg(ctx, theme, x, y, maxWidth, contentHeight);

  const drawRow = (row, rowIndex, rowY, isHeader = false) => {
    let cellX = x + pad.left + grid;
    const rowHeight = rowHeights[rowIndex];

    if (isHeader) {
      ctx.save();
      ctx.fillStyle = theme.foreground;
      ctx.globalAlpha = 0.05;
      roundRect(ctx, x + pad.left, rowY, maxWidth - pad.left - pad.right, rowHeight, 10);
      ctx.fill();
      ctx.restore();
    }

    for (let col = 0; col < widths.length; col++) {
      const cellWidth = widths[col];
      const innerW = Math.max(1, innerWidths[col]);
      const text = tableCellText(row[col]);
      const lines = collectLines(text, font, innerW);
      const contentHeight = lines.length * lineHeight;
      const textTop = rowY + Math.round((rowHeight - contentHeight) / 2);
      const align = table.alignments?.[col] || "left";
      const textX = align === "right"
        ? cellX + cellWidth - pad.cellX
        : align === "center"
          ? cellX + Math.round(cellWidth / 2)
          : cellX + pad.cellX;

      ctx.save();
      ctx.fillStyle = isHeader ? theme.foreground : theme.mutedForeground;
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.textAlign = align;
      let ty = textTop;
      for (const line of lines) {
        ctx.fillText(line.text, textX, ty);
        ty += lineHeight;
      }
      ctx.restore();

      cellX += cellWidth + grid;
    }
  };

  // Outer border and grid
  ctx.save();
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, maxWidth, tableHeight, 14) : roundRect(ctx, x, y, maxWidth, tableHeight, 14);
  ctx.stroke();
  ctx.restore();

  let rowY = y + pad.top;
  drawRow(allRows[0] || [], 0, rowY, true);
  rowY += rowHeights[0] + grid;
  for (let rowIndex = 1; rowIndex < allRows.length; rowIndex++) {
    drawRow(allRows[rowIndex], rowIndex, rowY, false);
    rowY += rowHeights[rowIndex] + grid;
  }

  // Horizontal grid lines
  ctx.save();
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  let lineY = y + pad.top + rowHeights[0];
  ctx.beginPath();
  ctx.moveTo(x + pad.left, lineY);
  ctx.lineTo(x + maxWidth - pad.right, lineY);
  ctx.stroke();
  lineY += grid;
  for (let rowIndex = 1; rowIndex < rowHeights.length; rowIndex++) {
    lineY += rowHeights[rowIndex - 1];
    ctx.beginPath();
    ctx.moveTo(x + pad.left, lineY);
    ctx.lineTo(x + maxWidth - pad.right, lineY);
    ctx.stroke();
    lineY += grid;
  }
  ctx.restore();

  // Vertical lines
  ctx.save();
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  let colX = x + pad.left;
  for (let col = 0; col <= widths.length; col++) {
    ctx.beginPath();
    ctx.moveTo(colX, y + pad.top);
    ctx.lineTo(colX, y + contentHeight);
    ctx.stroke();
    colX += (widths[col] || 0) + grid;
  }
  ctx.restore();

  return tableHeight;
}

function measureTableSegmentHeight(ctx, table, font, lineHeight, maxWidth) {
  return measureTableLayout(ctx, table, font, lineHeight, maxWidth).totalHeight;
}

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
      const chunks = splitTableIntoChunks(seg, _measureCtx, bodyFont, bodyLineHeight, layout.contentWidth, firstMaxHeight, availableHeight);

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

// Returns null if path missing or fails.
// aspectRatio: "16/9" | "4/3" | "1/1" | "free" (default)
// imagePosition: "top" | "center" | "bottom" (default "top")
// When set, image is cropped to that ratio at the given vertical position.
async function loadSectionImage(imagePath, contentWidth, maxH = 700, aspectRatio = "free", imagePosition = "top") {
  if (!imagePath) return null;
  try {
    const resolved = path.isAbsolute(imagePath) ? imagePath : path.resolve(imagePath);
    const img = await loadImage(resolved);

    // Compute crop region based on aspect ratio
    let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
    if (aspectRatio !== "free") {
      const [rw, rh] = aspectRatio.split("/").map(Number);
      const targetRatio = rw / rh;
      const imgRatio = img.width / img.height;
      if (imgRatio > targetRatio) {
        // Too wide — crop sides (always center horizontally)
        srcW = Math.round(img.height * targetRatio);
        srcX = Math.round((img.width - srcW) / 2);
      } else {
        // Too tall — crop vertically by position
        srcH = Math.round(img.width / targetRatio);
        if (imagePosition === "center") {
          srcY = Math.round((img.height - srcH) / 2);
        } else if (imagePosition === "bottom") {
          srcY = img.height - srcH;
        } else {
          srcY = 0; // top
        }
      }
    }

    // Scale cropped region to contentWidth
    let scale = contentWidth / srcW;
    let drawW = contentWidth;
    let drawH = Math.round(srcH * scale);

    // Cap height
    if (drawH > maxH) {
      scale = maxH / srcH;
      drawH = maxH;
      drawW = Math.round(srcW * scale);
    }

    return { img, srcX, srcY, srcW, srcH, drawW, drawH };
  } catch (e) {
    console.error(`[poster-render] Could not load image: ${imagePath} — ${e.message}`);
    return null;
  }
}

// --- Slide renderers ---
async function renderCover(content, theme, layout, totalSlides) {
  const { canvas, ctx } = createSlideCanvas(theme);

  if (content.cover.coverImage) {
    const W = TOKENS.canvas.width;
    const H = TOKENS.canvas.height;
    const cover = content.cover;
    const coverStyle = cover.coverStyle || "card";

    // Shared font setup
    const cardTitleSize = Math.round(TOKENS.type.headline.size * 1.4); // ~73px
    const cardTitleLH   = Math.round(cardTitleSize * 1.33);
    const fm = TOKENS.fonts[theme.fontFamily] || TOKENS.fonts.sans;
    const titleFont = `${TOKENS.type.headline.weight} ${cardTitleSize}px "${fm.name}", ${fm.fallback}, "Apple Color Emoji"`;
    const subFont   = fontString("body", theme.fontFamily);

    // Load image (fallback to placeholder on error)
    const resolved = path.isAbsolute(cover.coverImage)
      ? cover.coverImage
      : path.resolve(cover.coverImage);
    let img = null;
    try { img = await loadImage(resolved); }
    catch (e) { console.warn(`Failed to load cover image: ${e.message}`); }

    // Draw image crop-to-fill (object-fit: cover) into any rect
    function drawCoverImg(dx, dy, dw, dh) {
      if (!img) { ctx.fillStyle = theme.mutedForeground + "33"; ctx.fillRect(dx, dy, dw, dh); return; }
      const targetRatio = dw / dh;
      const imgRatio = img.width / img.height;
      let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
      if (imgRatio > targetRatio) { srcW = Math.round(img.height * targetRatio); srcX = Math.round((img.width - srcW) / 2); }
      else { srcH = Math.round(img.width / targetRatio); }
      ctx.drawImage(img, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
    }

    // Clip to a rounded rect, run fn, then restore
    function withRoundedClip(x, y, w, h, tl, tr, br, bl, fn) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + tl, y);
      ctx.lineTo(x + w - tr, y); ctx.quadraticCurveTo(x + w, y,     x + w, y + tr);
      ctx.lineTo(x + w, y + h - br); ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
      ctx.lineTo(x + bl, y + h); ctx.quadraticCurveTo(x,     y + h, x,     y + h - bl);
      ctx.lineTo(x, y + tl); ctx.quadraticCurveTo(x, y, x + tl, y);
      ctx.closePath();
      ctx.clip();
      fn();
      ctx.restore();
    }

    // Parse "#RRGGBB" → "rgba(r,g,b,a)" for gradient stops
    function hexRgba(hex, alpha) {
      const h = hex.replace("#", "");
      return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;
    }

    // Text renderer (left-aligned unless ctx.textAlign is set externally)
    function drawTextBlock(text, font, color, x, startY, maxW, lineH) {
      ctx.fillStyle = color;
      ctx.font = font;
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      const prepared = prepareWithSegments(text, font, { whiteSpace: "pre-wrap" });
      let y = startY;
      while (true) {
        const line = layoutNextLine(prepared, cursor, maxW);
        if (line === null) break;
        ctx.fillText(line.text, x, y);
        cursor = line.end;
        y += lineH;
      }
      return y;
    }

    if (coverStyle === "fluid") {
      // Full-bleed image, smooth gradient overlay starting at 40%, text on top
      withRoundedClip(0, 0, W, H, 0, 0, 0, 0, () => drawCoverImg(0, 0, W, H));

      // Extract dominant color from bottom 10% of image for gradient end
      function extractBottomColor(srcImg) {
        const sc = createCanvas(srcImg.width, srcImg.height);
        const sCtx = sc.getContext("2d");
        sCtx.drawImage(srcImg, 0, 0);
        const bottomY = Math.floor(srcImg.height * 0.9);
        const data = sCtx.getImageData(0, bottomY, srcImg.width, srcImg.height - bottomY).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; count++; }
        return { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) };
      }

      const { r: er, g: eg, b: eb } = img ? extractBottomColor(img) : { r: 0, g: 0, b: 0 };
      const lumEnd = 0.299 * er + 0.587 * eg + 0.114 * eb;
      const endRgba = (a) => `rgba(${er},${eg},${eb},${a})`;
      // Text color: dark if extracted color is light, white if dark
      const textColor    = lumEnd > 128 ? theme.foreground   : "#FFFFFF";
      const subTextColor = lumEnd > 128 ? theme.mutedForeground : "rgba(255,255,255,0.75)";

      // Gradient starts at 40%, multi-stop for natural fade to extracted color
      const gradStart = Math.round(H * 0.40);
      const grad = ctx.createLinearGradient(0, gradStart, 0, H);
      grad.addColorStop(0,    endRgba(0));
      grad.addColorStop(0.30, endRgba(0.12));
      grad.addColorStop(0.55, endRgba(0.45));
      grad.addColorStop(0.80, endRgba(0.85));
      grad.addColorStop(1,    endRgba(1));
      ctx.fillStyle = grad;
      ctx.fillRect(0, gradStart, W, H - gradStart);

      let y = Math.round(H * 0.64);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 2;
      y = drawTextBlock(cover.title, titleFont, textColor, layout.contentX, y, antiWidowWidth(cover.title, titleFont, layout.contentWidth), cardTitleLH);
      ctx.shadowBlur = 8;
      if (cover.subtitle) {
        y += layout.headlineToBody;
        drawTextBlock(cover.subtitle, subFont, subTextColor, layout.contentX, y, antiWidowWidth(cover.subtitle, subFont, layout.contentWidth), TOKENS.type.body.lineHeight);
      }
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    } else if (coverStyle === "inset") {
      // Near-edge image (16px gap), all-round corners, drop shadow + inset shadow
      const insetPad = 16;
      const imgW = W - 2 * insetPad;
      const imgH = Math.round(H * 0.50);
      const r = 24;
      const ix = insetPad, iy = insetPad;

      // Uniform-radius rounded rect path helper
      function rrPath(x, y, w, h, rad) {
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y,     x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x,     y + h, x,     y + h - rad);
        ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x,     y,     x + rad, y);
        ctx.closePath();
      }

      // Drop shadow: draw filled shape behind image with canvas shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 12;
      rrPath(ix, iy, imgW, imgH, r);
      ctx.fillStyle = theme.background;
      ctx.fill();
      ctx.restore();

      // Image + inset shadow (all inside same rounded clip)
      ctx.save();
      rrPath(ix, iy, imgW, imgH, r);
      ctx.clip();
      drawCoverImg(ix, iy, imgW, imgH);
      // Inset shadow — top edge
      const topGrad = ctx.createLinearGradient(0, iy, 0, iy + 72);
      topGrad.addColorStop(0, "rgba(0,0,0,0.18)");
      topGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topGrad; ctx.fillRect(ix, iy, imgW, 72);
      // Inset shadow — left edge
      const leftGrad = ctx.createLinearGradient(ix, 0, ix + 48, 0);
      leftGrad.addColorStop(0, "rgba(0,0,0,0.10)");
      leftGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leftGrad; ctx.fillRect(ix, iy, 48, imgH);
      // Inset shadow — right edge
      const rightGrad = ctx.createLinearGradient(ix + imgW - 48, 0, ix + imgW, 0);
      rightGrad.addColorStop(0, "rgba(0,0,0,0)");
      rightGrad.addColorStop(1, "rgba(0,0,0,0.10)");
      ctx.fillStyle = rightGrad; ctx.fillRect(ix + imgW - 48, iy, 48, imgH);
      ctx.restore();

      ctx.textAlign = "center";
      let y = iy + imgH + Math.round(layout.padY * 0.65);
      y = drawTextBlock(cover.title, titleFont, theme.foreground, W / 2, y, layout.contentWidth, cardTitleLH);
      if (cover.subtitle) {
        y += layout.headlineToBody;
        drawTextBlock(cover.subtitle, subFont, theme.mutedForeground, W / 2, y, layout.contentWidth, TOKENS.type.body.lineHeight);
      }
      ctx.textAlign = "left";

    } else {
      // "card" — image top ~55% with rounded top corners, text below left-aligned
      const imgH = Math.round(H * 0.55);
      withRoundedClip(0, 0, W, imgH, 40, 40, 0, 0, () => drawCoverImg(0, 0, W, imgH));

      let y = imgH + Math.round(layout.padY * 0.75);
      y = drawTextBlock(cover.title, titleFont, theme.foreground, layout.contentX, y, antiWidowWidth(cover.title, titleFont, layout.contentWidth), cardTitleLH);
      if (cover.subtitle) {
        y += layout.headlineToBody;
        drawTextBlock(cover.subtitle, subFont, theme.mutedForeground, layout.contentX, y, antiWidowWidth(cover.subtitle, subFont, layout.contentWidth), TOKENS.type.body.lineHeight);
      }
    }
  } else {
    // Text-only cover (existing behaviour)
    const titleFont = fontString("title", theme.fontFamily);
    const subFont   = fontString("subtitle", theme.fontFamily);
    const subtitleGap = Math.round(layout.headlineToBody * 1.5);
    let y = layout.padY;

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

async function renderContentSlides(sections, theme, layout, startSlideNum, totalSlides) {
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

  // Group sections into pages (sections with images always get their own page)
  const pages = [];
  let currentPage = [], usedH = 0;
  for (let si = 0; si < sections.length; si++) {
    const imgData = loadedImages[si];
    const secH = measureSectionHeight(
      sections[si],
      headlineFont,
      bodyFont,
      headLH,
      bodyLH,
      layout,
      codeStyle,
      imgData?.drawH ?? 0
    );
    const gap = currentPage.length > 0 ? (sections[si].noGap ? 0 : sectionGap) : 0;
    // Sections with images always start a new page
    const forceNewPage = imgData && currentPage.length > 0;
    if (forceNewPage || (currentPage.length > 0 && usedH + gap + secH > AVAILABLE_H)) {
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
      const imgData = loadedImages[pageIndices[i]];
      if (i > 0 && !section.noGap) y += sectionGap;

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
        y += h + headlineToBody;
      }

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

      const segments = normalizeBody(section.body);
      if (segments) {
        for (let si = 0; si < segments.length; si++) {
          const seg = segments[si];
          if (si > 0) y += SEGMENT_GAP;

          if (seg.type === "callout") {
            const pad = SEGMENT_PAD.callout;
            const emojiSize = Math.round(TOKENS.type.body.size * 1.2);
            const emojiGap = 8;
            const hasEmojiImg = seg.emoji && isEmoji(seg.emoji);
            let emojiImg = null;
            if (hasEmojiImg) {
              emojiImg = await loadEmojiImage(seg.emoji);
            }
            const emojiOffset = emojiImg ? emojiSize + emojiGap : 0;
            const innerW = layout.contentWidth - pad.left - pad.right - emojiOffset;
            // If emoji image failed, fall back to ASCII prefix
            const displayText = (!emojiImg && seg.emoji
              ? (EMOJI_ASCII_FALLBACK[seg.emoji] || seg.emoji) + " "
              : "") + seg.content;
            const textH = measureTextHeight(displayText, bodyFont, innerW, bodyLH);
            const minH = emojiImg ? Math.max(textH, emojiSize) : textH;
            const boxH = pad.top + minH + pad.bottom;

            drawCardBg(ctx, theme, layout.contentX, y, layout.contentWidth, boxH);

            // Left accent border
            ctx.save();
            ctx.fillStyle = theme.foreground;
            ctx.globalAlpha = 0.6;
            roundRect(ctx, layout.contentX, y, pad.borderWidth, boxH, pad.borderWidth / 2);
            ctx.fill();
            ctx.restore();

            // Emoji image
            if (emojiImg) {
              const emojiX = layout.contentX + pad.left;
              const emojiY = y + pad.top + Math.round((bodyLH - emojiSize) / 2);
              ctx.drawImage(emojiImg, emojiX, emojiY, emojiSize, emojiSize);
            }

            // Text
            ctx.fillStyle = theme.mutedForeground;
            ctx.font = bodyFont;
            let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
            const prepared = prepareWithSegments(displayText, bodyFont, { whiteSpace: "pre-wrap" });
            let ty = y + pad.top;
            const textX = layout.contentX + pad.left + emojiOffset;
            while (true) {
              const line = layoutNextLine(prepared, bCursor, innerW);
              if (line === null) break;
              const isEmpty = line.text.trim() === "";
              if (!isEmpty) ctx.fillText(line.text, textX, ty);
              bCursor = line.end;
              ty += isEmpty ? Math.round(bodyLH * TOKENS.paragraphGap) : bodyLH;
            }
            y += boxH;

          } else if (seg.type === "code") {
            const pad = {
              top: codePadTop,
              bottom: codePadBottom,
              left: codePadLeft,
              right: codePadRight,
            };
            const innerW = layout.contentWidth - pad.left - pad.right;
            const textH = measureCodeHeight(ctx, seg.content, codeFontSize, codeLineHeight, innerW);
            const boxH = pad.top + textH + pad.bottom;

            drawCardBg(ctx, theme, layout.contentX, y, layout.contentWidth, boxH);

            // Syntax-highlighted code via Shiki (falls back to plain mono)
            const codeRendered = await renderCodeTokens(
              ctx,
              seg.content,
              seg.lang || seg.language || "text",
              layout.contentX + pad.left,
              y + pad.top,
              innerW,
              theme.palette,
              codeFontSize,
              codeLineHeight
            );
            if (codeRendered === null) {
              // Fallback: plain monochrome
              ctx.fillStyle = theme.subtleForeground;
              ctx.font = monoFontString(codeFontSize);
              ctx.textBaseline = "top";
              let ty = y + pad.top;
              for (const line of seg.content.split("\n")) {
                if (line.length === 0) {
                  ty += codeLineHeight;
                  continue;
                }

                let curX = 0;
                for (let ci = 0; ci < line.length; ) {
                  const fit = fitCodeChunk(ctx, line.slice(ci), curX, innerW);
                  if (fit) {
                    ctx.fillText(fit.chunk, layout.contentX + pad.left + curX, ty);
                    curX += fit.width;
                    ci += fit.chunk.length;
                  } else {
                    curX = 0;
                    ty += codeLineHeight;
                  }
                }
                ty += codeLineHeight;
              }
            }
            y += boxH;

          } else if (seg.type === "table") {
            const tableH = renderTableChunk(
              ctx,
              theme,
              layout,
              seg,
              layout.contentX,
              y,
              layout.contentWidth,
              bodyFont,
              bodyLH
            );
            y += tableH;

          } else {
            // text or list — same as before
            const bodyW = antiWidowWidth(seg.content, bodyFont, layout.contentWidth);
            ctx.fillStyle = theme.mutedForeground;
            ctx.font = bodyFont;
            let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
            const bodyPrepared = prepareWithSegments(seg.content, bodyFont, { whiteSpace: "pre-wrap" });
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
      }
    }

    drawSlideCounter(ctx, theme, layout, slideNum, totalSlides);
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
    console.error("Usage: node render.js <content.json> [--spacing sm|md|lg] [--palette light|dark|warm|slate|paper|teal|midnight|clay] [--output <dir>] [--help]");
  };

  const parseArgs = () => {
    let inputFile = null;
    let cliSpacing = null;
    let cliPalette = null;
    let cliOutput = "./output";

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-h" || arg === "--help") {
        return { help: true };
      }
      if (arg === "--spacing" || arg === "--palette" || arg === "--output") {
        const value = args[i + 1];
        if (!value || value.startsWith("--")) {
          throw new Error(`Missing value for ${arg}`);
        }
        if (arg === "--spacing") cliSpacing = value;
        else if (arg === "--palette") cliPalette = value;
        else cliOutput = value;
        i++;
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

    return { inputFile, cliSpacing, cliPalette, cliOutput };
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

  const { inputFile, cliSpacing, cliPalette, cliOutput } = parsed;
  if (!inputFile) {
    printUsage();
    process.exit(1);
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

  // Code block style overrides
  theme.codeFontSize = resolveThemeNumber(theme.codeFontSize, TOKENS.type.code.size);
  theme.codeLineHeight = resolveThemeNumber(theme.codeLineHeight, TOKENS.type.code.lineHeight);
  theme.codePadTop = resolveThemeNumber(theme.codePadTop, SEGMENT_PAD.code.top);
  theme.codePadBottom = resolveThemeNumber(theme.codePadBottom, SEGMENT_PAD.code.bottom);
  theme.codePadLeft = resolveThemeNumber(theme.codePadLeft, SEGMENT_PAD.code.left);
  theme.codePadRight = resolveThemeNumber(theme.codePadRight, SEGMENT_PAD.code.right);

  const layout = resolveLayout(theme);

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

  const sections = expandSectionsForTables(content.sections, loadedImages, theme, layout, bodyFont, headlineFont, headLH, bodyLH);

  // Dry-run: count slides (sections with images always get their own page)
  let dryCount = 0, dryUsed = 0, dryHas = false;
  for (let si = 0; si < sections.length; si++) {
    const imgData = sections[si].imgData;
    const secH = measureSectionHeight(
      sections[si],
      headlineFont,
      bodyFont,
      headLH,
      bodyLH,
      layout,
      codeStyle,
      imgData?.drawH ?? 0
    );
    const gap = dryHas ? (sections[si].noGap ? 0 : layout.sectionGap) : 0;
    const forceNewPage = imgData && dryHas;
    if (forceNewPage || (dryHas && dryUsed + gap + secH > AVAILABLE_H)) {
      dryCount++;
      dryUsed = secH;
    } else {
      dryUsed += gap + secH;
      dryHas = true;
    }
  }
  if (dryHas) dryCount++;

  const hasCTA = Boolean(content.cta && content.cta.trim());
  const totalSlides = 1 + dryCount + (hasCTA ? 1 : 0);

  const allSlides = [];
  allSlides.push(await renderCover(content, theme, layout, totalSlides));
  allSlides.push(...await renderContentSlides(sections, theme, layout, 2, totalSlides));
  if (hasCTA) {
    allSlides.push(renderCTA(content, theme, layout, allSlides.length + 1, totalSlides));
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
  main();
}

export { fitCodeChunk, countWrappedCodeLines, measureCodeHeight };
