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

// --- Design Tokens ---
const TOKENS = {
  // Canvas
  canvas: {
    width: 1080,
    height: 1350,
  },

  // Spacing (base unit: 4px)
  space: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    "2xl": 48,
    "3xl": 56,
    "4xl": 72,
    "5xl": 100,
  },

  // Layout zones
  layout: {
    padX: 100,       // horizontal padding
    padTop: 100,     // top padding
    padBottom: 100,  // bottom padding
    headerH: 100,    // space reserved for slide header area
    footerH: 60,     // space reserved for slide footer area
  },

  // Type scale (size in px, at 1080px canvas)
  type: {
    title:    { size: 80, weight: "600", lineHeight: 100 },
    subtitle: { size: 34, weight: "normal", lineHeight: 52 },
    headline: { size: 52, weight: "600", lineHeight: 70 },
    body:     { size: 34, weight: "normal", lineHeight: 51 },
    small:    { size: 22, weight: "normal", lineHeight: 34 },
  },

  // Rhythm (spacing between text blocks)
  rhythm: {
    headlineToBody: 32,       // gap between headline and body text
    paragraphGap: 0.25,       // empty line multiplier (fraction of lineHeight)
    sectionGap: 56,           // gap between sections (body → next headline)
  },

  // Font families
  fonts: {
    sans:  { name: "Helvetica Neue", fallback: "Helvetica, Arial, sans-serif" },
    serif: { name: "Georgia",        fallback: "Times New Roman, serif" },
    mono:  { name: "Menlo",          fallback: "Consolas, monospace" },
  },

  // Default theme (can be overridden by content.json)
  theme: {
    background:        "#FAFAF8",
    foreground:        "#09090B",
    mutedForeground:   "#71717A",
    accent:            "#3B82F6",
    fontFamily:        "sans",
    handle:            "@yz_atom63",
    subtleForeground:  "#A1A1AA",  // zinc-400 — counter on light slides
    invertedBg:        "#09090B",  // CTA dark background
    invertedFg:        "#FAFAF8",  // CTA light text
    invertedSubtle:    "#52525B",  // zinc-600 — counter on dark slides
  },
};

// --- Derived constants (computed from TOKENS) ---
const CONTENT_X = TOKENS.layout.padX;
const CONTENT_WIDTH = TOKENS.canvas.width - TOKENS.layout.padX * 2;
const CONTENT_TOP = TOKENS.layout.padTop + TOKENS.layout.headerH;
const CONTENT_BOTTOM = TOKENS.canvas.height - TOKENS.layout.padBottom - TOKENS.layout.footerH;

// --- Font registration ---
// Maps filename patterns to font families.
// node-canvas requires static-weight TTF/OTF; variable woff2 is not supported.
// If static Geist weights are added to ./fonts/, they'll be picked up automatically.
const FONT_FILE_PATTERNS = [
  { pattern: "geistmono", family: TOKENS.fonts.mono.name },
  { pattern: "geist", family: TOKENS.fonts.sans.name },
  { pattern: "helvetica", family: "Helvetica Neue" },
  { pattern: "georgia", family: "Georgia" },
  { pattern: "menlo", family: "Menlo" },
];

function tryRegisterFonts() {
  const fontsDir = path.resolve("./fonts");
  if (!fs.existsSync(fontsDir)) return;
  const files = fs.readdirSync(fontsDir);
  for (const file of files) {
    if (!/\.(ttf|otf)$/i.test(file)) continue;
    const filePath = path.join(fontsDir, file);
    const lower = file.toLowerCase();
    const match = FONT_FILE_PATTERNS.find((p) => lower.includes(p.pattern));
    if (!match) continue;
    const weight = lower.includes("bold")
      ? "bold"
      : lower.includes("semibold") || lower.includes("600")
        ? "600"
        : "normal";
    try {
      registerFont(filePath, { family: match.family, weight });
    } catch {
      // skip unloadable fonts
    }
  }
}

// --- Helpers ---
function fontString(typeKey, fontFamily) {
  const t = TOKENS.type[typeKey];
  const fm = TOKENS.fonts[fontFamily] || TOKENS.fonts.sans;
  const family = `"${fm.name}", ${fm.fallback}`;
  // Canvas font shorthand: weight must be a keyword or number
  const w = t.weight === "normal" ? "" : t.weight + " ";
  return `${w}${t.size}px ${family}`;
}

function monoFontString(size) {
  const fm = TOKENS.fonts.mono;
  return `${size}px "${fm.name}", ${fm.fallback}`;
}

function createSlideCanvas(bg) {
  const canvas = createCanvas(TOKENS.canvas.width, TOKENS.canvas.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TOKENS.canvas.width, TOKENS.canvas.height);
  ctx.textBaseline = "top";
  return { canvas, ctx };
}

function drawSlideCounter(ctx, theme, slideNum, totalSlides, isInverted) {
  const text =
    String(slideNum).padStart(2, "0") +
    " / " +
    String(totalSlides).padStart(2, "0");
  ctx.fillStyle = isInverted ? theme.invertedSubtle : theme.subtleForeground;
  ctx.font = monoFontString(TOKENS.type.small.size);
  const m = ctx.measureText(text);
  ctx.fillText(text, TOKENS.canvas.width - TOKENS.layout.padX - m.width, TOKENS.canvas.height - TOKENS.layout.padBottom + 10);
}

// --- Slide renderers ---
function renderCover(content, theme, totalSlides) {
  const { canvas, ctx } = createSlideCanvas(theme.background);

  // Title — left-aligned, vertically centered-ish
  ctx.fillStyle = theme.foreground;
  ctx.font = fontString("title", theme.fontFamily);
  const titleFont = fontString("title", theme.fontFamily);
  const titleLineHeight = TOKENS.type.title.lineHeight;

  const titlePrepared = prepareWithSegments(content.cover.title, titleFont, {
    whiteSpace: "pre-wrap",
  });
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = TOKENS.layout.padTop;
  while (true) {
    const line = layoutNextLine(titlePrepared, cursor, CONTENT_WIDTH);
    if (line === null) break;
    ctx.fillText(line.text, CONTENT_X, y);
    cursor = line.end;
    y += titleLineHeight;
  }

  // Subtitle — 40px gap, muted color
  if (content.cover.subtitle) {
    y += 40;
    ctx.fillStyle = theme.mutedForeground;
    ctx.font = fontString("subtitle", theme.fontFamily);
    const subFont = fontString("subtitle", theme.fontFamily);
    const subPrepared = prepareWithSegments(content.cover.subtitle, subFont, {
      whiteSpace: "pre-wrap",
    });
    cursor = { segmentIndex: 0, graphemeIndex: 0 };
    const subLineHeight = TOKENS.type.subtitle.lineHeight;
    while (true) {
      const line = layoutNextLine(subPrepared, cursor, CONTENT_WIDTH);
      if (line === null) break;
      ctx.fillText(line.text, CONTENT_X, y);
      cursor = line.end;
      y += subLineHeight;
    }
  }

  // Slide counter — bottom right
  drawSlideCounter(ctx, theme, 1, totalSlides, false);
  return canvas;
}

function renderCTA(content, theme, slideNum, totalSlides) {
  // Dark inverted slide
  const { canvas, ctx } = createSlideCanvas(theme.invertedBg);

  // CTA text — left-aligned, headline size, white
  ctx.fillStyle = theme.invertedFg;
  const ctaFont = fontString("headline", theme.fontFamily);
  ctx.font = ctaFont;

  const ctaPrepared = prepareWithSegments(content.cta, ctaFont, {
    whiteSpace: "pre-wrap",
  });
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  const lineHeight = TOKENS.type.headline.lineHeight;
  let y = TOKENS.layout.padTop;
  while (true) {
    const line = layoutNextLine(ctaPrepared, cursor, CONTENT_WIDTH);
    if (line === null) break;
    ctx.fillText(line.text, CONTENT_X, y);
    cursor = line.end;
    y += lineHeight;
  }

  // Slide counter — bottom right, inverted
  drawSlideCounter(ctx, theme, slideNum, totalSlides, true);
  return canvas;
}

// --- Content slide rendering with auto-pagination ---
function renderContentSlides(sections, theme, startSlideNum, totalSlides) {
  const slides = [];
  const bodyFont = fontString("body", theme.fontFamily);
  const headlineFont = fontString("headline", theme.fontFamily);
  const bodyLineHeight = TOKENS.type.body.lineHeight;
  const headlineLineHeight = 66;
  const sectionGap = TOKENS.rhythm.sectionGap;

  let currentCanvas, currentCtx;
  let y;
  let slideNum = startSlideNum;

  function openSlide() {
    const { canvas, ctx } = createSlideCanvas(theme.background);
    currentCanvas = canvas;
    currentCtx = ctx;
    y = TOKENS.layout.padTop + 80;
  }

  function closeSlide() {
    drawSlideCounter(currentCtx, theme, slideNum, totalSlides, false);
    slides.push(currentCanvas);
    slideNum++;
  }

  openSlide();

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];

    // Check if headline fits; if not, start new slide
    if (section.headline) {
      if (y + headlineLineHeight > CONTENT_BOTTOM) {
        closeSlide();
        openSlide();
      }
      // Headline — left-aligned, foreground color
      currentCtx.fillStyle = theme.foreground;
      currentCtx.font = headlineFont;

      const headPrepared = prepareWithSegments(section.headline, headlineFont, {
        whiteSpace: "pre-wrap",
      });
      let hCursor = { segmentIndex: 0, graphemeIndex: 0 };
      while (true) {
        const line = layoutNextLine(headPrepared, hCursor, CONTENT_WIDTH);
        if (line === null) break;
        if (y + headlineLineHeight > CONTENT_BOTTOM) {
          closeSlide();
          openSlide();
          currentCtx.fillStyle = theme.foreground;
          currentCtx.font = headlineFont;
        }
        currentCtx.fillText(line.text, CONTENT_X, y);
        hCursor = line.end;
        y += headlineLineHeight;
      }

      y += TOKENS.rhythm.headlineToBody;
    }

    // Body text with auto-pagination
    if (section.body) {
      currentCtx.fillStyle = theme.foreground;
      currentCtx.font = bodyFont;

      const bodyPrepared = prepareWithSegments(section.body, bodyFont, {
        whiteSpace: "pre-wrap",
      });
      let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
      while (true) {
        const line = layoutNextLine(bodyPrepared, bCursor, CONTENT_WIDTH);
        if (line === null) break;

        if (y + bodyLineHeight > CONTENT_BOTTOM) {
          closeSlide();
          openSlide();
          currentCtx.fillStyle = theme.foreground;
          currentCtx.font = bodyFont;
        }

        const isEmpty = line.text.trim() === "";
        if (!isEmpty) {
          currentCtx.fillText(line.text, CONTENT_X, y);
        }
        bCursor = line.end;
        y += isEmpty ? Math.round(bodyLineHeight * TOKENS.rhythm.paragraphGap) : bodyLineHeight;
      }
    }

    // Gap between sections
    if (si < sections.length - 1) {
      y += sectionGap;
    }
  }

  // Close final content slide
  closeSlide();

  return slides;
}

// --- Main ---
function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: node render.js <content.json>");
    process.exit(1);
  }

  tryRegisterFonts();

  const content = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const theme = { ...TOKENS.theme, ...content.theme };

  // First pass: estimate total slides (cover + content + cta)
  // We do a dry-run of content slides to count them
  const bodyFont = fontString("body", theme.fontFamily);
  const headlineFont = fontString("headline", theme.fontFamily);
  const bodyLineHeight = TOKENS.type.body.lineHeight;
  const headlineLineHeight = 66;
  const sectionGap = TOKENS.rhythm.sectionGap;

  let drySlideCount = 1; // starts at 1 content slide
  let dryY = TOKENS.layout.padTop + 80;

  for (let si = 0; si < content.sections.length; si++) {
    const section = content.sections[si];

    if (section.headline) {
      const headPrepared = prepareWithSegments(section.headline, headlineFont, {
        whiteSpace: "pre-wrap",
      });
      let hCursor = { segmentIndex: 0, graphemeIndex: 0 };
      while (true) {
        const line = layoutNextLine(headPrepared, hCursor, CONTENT_WIDTH);
        if (line === null) break;
        if (dryY + headlineLineHeight > CONTENT_BOTTOM) {
          drySlideCount++;
          dryY = TOKENS.layout.padTop + 80;
        }
        hCursor = line.end;
        dryY += headlineLineHeight;
      }
      dryY += TOKENS.rhythm.headlineToBody;
    }

    if (section.body) {
      const bodyPrepared = prepareWithSegments(section.body, bodyFont, {
        whiteSpace: "pre-wrap",
      });
      let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
      while (true) {
        const line = layoutNextLine(bodyPrepared, bCursor, CONTENT_WIDTH);
        if (line === null) break;
        const isEmpty = line.text.trim() === "";
        if (dryY + bodyLineHeight > CONTENT_BOTTOM) {
          drySlideCount++;
          dryY = TOKENS.layout.padTop + 80;
        }
        bCursor = line.end;
        dryY += isEmpty ? Math.round(bodyLineHeight * TOKENS.rhythm.paragraphGap) : bodyLineHeight;
      }
    }

    if (si < content.sections.length - 1) {
      dryY += sectionGap;
    }
  }

  const totalSlides = 1 + drySlideCount + 1; // cover + content slides + CTA

  // Render all slides
  const allSlides = [];

  // Cover
  allSlides.push(renderCover(content, theme, totalSlides));

  // Content slides
  const contentSlides = renderContentSlides(
    content.sections,
    theme,
    2,
    totalSlides
  );
  allSlides.push(...contentSlides);

  // CTA
  allSlides.push(renderCTA(content, theme, allSlides.length + 1, totalSlides));

  // Write output
  const outDir = path.resolve("./output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < allSlides.length; i++) {
    const num = String(i + 1).padStart(2, "0");
    const outPath = path.join(outDir, `slide-${num}.png`);
    fs.writeFileSync(outPath, allSlides[i].toBuffer("image/png"));
  }

  console.log(`Rendered ${allSlides.length} slides to ./output/`);
}

main();
