import { createCanvas } from 'canvas';
export { normalizeEastereggConfig } from './render-config.js';

const ALL_PATTERNS = ['none', 'dot-grid', 'line-grid', 'diagonal', 'halftone', 'dither', 'ascii', 'paper'];
const DENSE_PATTERNS = new Set(['dither', 'ascii']);
const ALL_BLENDS = ['source-over', 'multiply', 'overlay', 'screen', 'soft-light'];
const PRESENTATION_RECIPES = [
  { name: 'editorial-light', palette: 'light', spacing: 'sm', pattern: 'line-grid', patternSpacing: 38, patternOpacity: 0.06, patternBlend: 'source-over' },
  { name: 'warm-spotlight', palette: 'warm', spacing: 'md', pattern: 'paper', patternSpacing: 44, patternOpacity: 0.08, patternBlend: 'multiply' },
  { name: 'midnight-editor', palette: 'midnight', spacing: 'lg', pattern: 'halftone', patternSpacing: 54, patternOpacity: 0.07, patternBlend: 'soft-light' },
  { name: 'slate-grid', palette: 'slate', spacing: 'sm', pattern: 'dot-grid', patternSpacing: 40, patternOpacity: 0.08, patternBlend: 'overlay' },
  { name: 'paper-archive', palette: 'paper', spacing: 'lg', pattern: 'ascii', patternSpacing: 34, patternOpacity: 0.05, patternBlend: 'source-over' },
  { name: 'clay-print', palette: 'clay', spacing: 'md', pattern: 'dither', patternSpacing: 32, patternOpacity: 0.06, patternBlend: 'multiply' },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSeedToken(value) {
  if (value == null) return null;
  const token = String(value).trim();
  return token || null;
}

function normalizeIntensity(value) {
  return value === 'medium' ? 'medium' : 'low';
}

function sanitizePattern(value) {
  return ALL_PATTERNS.includes(value) ? value : 'none';
}

function sanitizeBlend(value) {
  return ALL_BLENDS.includes(value) ? value : 'source-over';
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choice(items, random) {
  if (!items.length) return null;
  return items[Math.floor(random() * items.length)];
}

function stableSortKeys(value) {
  if (Array.isArray(value)) return value.map(stableSortKeys);
  if (!value || typeof value !== 'object') return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const next = value[key];
    if (typeof next === 'function' || typeof next === 'undefined') continue;
    sorted[key] = stableSortKeys(next);
  }
  return sorted;
}

export function deriveDeckIdentity(content = {}) {
  const deck = {
    template: content.template ?? content.boardStyle ?? null,
    cover: content.cover ?? null,
    sections: content.sections ?? null,
    cta: content.cta ?? null,
    tags: content.tags ?? null,
    easterEgg: null,
    theme: null,
  };
  return JSON.stringify(stableSortKeys(deck));
}


function buildLayerFromTheme(theme = {}, overrides = {}) {
  const pattern = sanitizePattern(overrides.pattern ?? theme.pattern);
  const baseSpacing = Number.isFinite(overrides.patternSpacing)
    ? overrides.patternSpacing
    : Number.isFinite(theme.patternSpacing)
      ? theme.patternSpacing
      : 48;

  return {
    pattern,
    opacity: overrides.opacity ?? theme.patternOpacity ?? 0.08,
    color: overrides.color ?? theme.patternColor ?? theme.foreground,
    spacing: baseSpacing,
    dotSize: overrides.dotSize ?? theme.patternDotSize,
    threshold: overrides.threshold ?? theme.patternThreshold,
    fontSize: overrides.fontSize ?? theme.patternFontSize,
    chars: overrides.chars ?? theme.patternChars,
    vary: overrides.vary ?? theme.patternVary,
    halftoneDir: overrides.halftoneDir ?? theme.patternHalftoneDir,
    shape: overrides.shape ?? theme.patternShape,
    strokes: overrides.strokes ?? theme.patternStrokes,
    dots: overrides.dots ?? theme.patternDots,
    mask: overrides.mask ?? theme.patternMask ?? 'bottom',
    blendMode: sanitizeBlend(overrides.blendMode ?? theme.patternBlend ?? 'source-over'),
  };
}

function buildDefaultPlan(theme = {}) {
  return {
    mode: 'off',
    layers: [buildLayerFromTheme(theme, { opacity: theme.pattern === 'none' ? 0 : theme.patternOpacity ?? 0.08 })],
  };
}

export function composeBackgroundPatternPlan(theme = {}, easterEgg = null, context = {}) {
  const defaultPlan = buildDefaultPlan(theme);
  const enabled = easterEgg?.mode === 'random-patterns';
  if (!enabled) return defaultPlan;

  try {
    const seedToken = normalizeSeedToken(easterEgg.seed) ?? normalizeSeedToken(context.deckIdentity) ?? 'default';
    const mixToken = [seedToken, normalizeSeedToken(context.deckIdentity) ?? '', normalizeSeedToken(context.templateName) ?? ''].join('|');
    const random = mulberry32(hashString(mixToken));
    const intensity = normalizeIntensity(easterEgg.intensity);
    const chooser = typeof context.chooseRecipe === 'function' ? context.chooseRecipe : choice;
    const recipe = chooser(PRESENTATION_RECIPES, random, { theme, easterEgg, context, intensity });
    if (!recipe) return defaultPlan;

    const recipePresentation = {
      palette: recipe.palette,
      spacing: recipe.spacing,
      pattern: recipe.pattern,
      patternSpacing: recipe.patternSpacing,
      patternOpacity: recipe.patternOpacity,
      patternBlend: recipe.patternBlend,
      patternMask: recipe.patternMask ?? 'none',
    };

    const basePattern = sanitizePattern(recipe.pattern);
    const layers = [buildLayerFromTheme(theme, {
      ...recipePresentation,
      pattern: basePattern,
      opacity: recipe.patternOpacity,
      blendMode: recipe.patternBlend,
      mask: recipe.patternMask ?? 'none',
      spacing: recipe.patternSpacing,
    })];

    const denseBase = DENSE_PATTERNS.has(basePattern);
    const overlayPool = denseBase
      ? ['paper', 'dot-grid']
      : ALL_PATTERNS.filter((pattern) => pattern !== 'none' && pattern !== basePattern);
    const overlayPattern = choice(overlayPool, random);
    if (overlayPattern) {
      const overlayOpacityFloor = intensity === 'medium' ? 0.06 : 0.04;
      const overlayOpacityCeil = intensity === 'medium' ? 0.14 : 0.10;
      const overlayOpacity = clamp(overlayOpacityFloor + random() * (overlayOpacityCeil - overlayOpacityFloor), overlayOpacityFloor, overlayOpacityCeil);
      const overlayBlend = choice(intensity === 'medium' ? ['multiply', 'overlay', 'screen', 'soft-light'] : ['multiply', 'screen', 'soft-light'], random);
      const spacingFactor = overlayPattern === 'paper'
        ? 0.5 + random() * 0.35
        : overlayPattern === 'dot-grid' || overlayPattern === 'line-grid'
          ? 0.7 + random() * 0.6
          : 0.8 + random() * 0.5;
      const overlaySpacing = Math.max(4, Math.round(recipe.patternSpacing * spacingFactor));

      layers.push(buildLayerFromTheme(theme, {
        pattern: overlayPattern,
        opacity: overlayOpacity,
        blendMode: overlayBlend,
        mask: 'none',
        spacing: overlaySpacing,
        dotSize: theme.patternDotSize,
        threshold: theme.patternThreshold,
        fontSize: theme.patternFontSize,
        chars: theme.patternChars,
        vary: theme.patternVary,
        halftoneDir: theme.patternHalftoneDir,
        shape: theme.patternShape,
        strokes: theme.patternStrokes,
        dots: theme.patternDots,
      }));
    }

    return {
      mode: 'random-patterns',
      seed: seedToken,
      intensity,
      recipe: recipe.name,
      presentation: recipePresentation,
      layers,
    };
  } catch {
    return defaultPlan;
  }
}

function drawLayerPattern(ctx, layer, tokens) {
  const { width: W, height: H, monoFontName } = tokens;
  const pattern = sanitizePattern(layer.pattern);
  if (pattern === 'none' || !(layer.opacity > 0)) return;

  const canvas = createCanvas(W, H);
  const pctx = canvas.getContext('2d');
  const color = layer.color ?? '#000000';
  const spacing = Number.isFinite(layer.spacing) && layer.spacing > 0 ? layer.spacing : 48;
  const cx = W / 2;
  const cy = H / 2;
  const offsetX = cx % spacing;
  const offsetY = cy % spacing;

  pctx.fillStyle = color;
  pctx.strokeStyle = color;

  if (pattern === 'dot-grid') {
    const r = layer.dotSize ?? 1.5;
    for (let x = offsetX; x < W; x += spacing) {
      for (let y = offsetY; y < H; y += spacing) {
        pctx.beginPath();
        pctx.arc(x, y, r, 0, Math.PI * 2);
        pctx.fill();
      }
    }
  } else if (pattern === 'line-grid') {
    pctx.lineWidth = 0.75;
    for (let x = offsetX; x < W; x += spacing) {
      pctx.beginPath();
      pctx.moveTo(x, 0);
      pctx.lineTo(x, H);
      pctx.stroke();
    }
    for (let y = offsetY; y < H; y += spacing) {
      pctx.beginPath();
      pctx.moveTo(0, y);
      pctx.lineTo(W, y);
      pctx.stroke();
    }
  } else if (pattern === 'diagonal') {
    pctx.lineWidth = 0.75;
    const diagOffset = (cx - cy) % spacing;
    for (let i = diagOffset - H; i < W + H; i += spacing) {
      pctx.beginPath();
      pctx.moveTo(i, 0);
      pctx.lineTo(i + H, H);
      pctx.stroke();
    }
  } else if (pattern === 'halftone') {
    const maxR = layer.dotSize ?? 5;
    const minR = 0.3;
    const dir = layer.halftoneDir ?? 'vertical';
    const htSpace = spacing;
    const shape = layer.shape ?? 'circle';
    const htOffX = cx % htSpace;
    const htOffY = cy % htSpace;

    for (let x = htOffX; x < W; x += htSpace) {
      for (let y = htOffY; y < H; y += htSpace) {
        let t;
        if (dir === 'horizontal') t = x / W;
        else if (dir === 'diagonal') t = (x / W + y / H) / 2;
        else t = y / H;
        const r = minR + (maxR - minR) * t;
        if (r < 0.2) continue;
        if (shape === 'square') {
          const s = r * 1.8;
          pctx.fillRect(x - s / 2, y - s / 2, s, s);
        } else {
          pctx.beginPath();
          pctx.arc(x, y, r, 0, Math.PI * 2);
          pctx.fill();
        }
      }
    }
  } else if (pattern === 'dither') {
    const bayer4 = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    const cellSize = spacing;
    const threshold = layer.threshold ?? 0.45;
    for (let px = 0; px < W; px += cellSize) {
      for (let py = 0; py < H; py += cellSize) {
        const bx = Math.floor(px / cellSize) % 4;
        const by = Math.floor(py / cellSize) % 4;
        if (bayer4[by][bx] / 16 < threshold) {
          pctx.fillRect(px, py, cellSize, cellSize);
        }
      }
    }
  } else if (pattern === 'ascii') {
    const chars = layer.chars ?? '10 ·∙ □■';
    const fontSize = layer.fontSize ?? 18;
    const charSpacingX = spacing;
    const charSpacingY = Math.round(charSpacingX * 1.5);
    const vary = layer.vary ?? true;
    pctx.font = `${fontSize}px "${monoFontName}", monospace`;
    pctx.textBaseline = 'top';
    const oX = cx % charSpacingX;
    const oY = cy % charSpacingY;
    let s2 = 9301;
    const rand2 = () => { s2 = (s2 * 49297 + 233280) % 233280; return s2 / 233280; };
    let row = 0;
    for (let y = oY; y < H; y += charSpacingY) {
      let col = 0;
      for (let x = oX; x < W; x += charSpacingX) {
        const ch = vary ? chars[Math.floor(rand2() * chars.length)] : chars[(row + col) % chars.length];
        pctx.fillText(ch, x, y);
        col++;
      }
      row++;
    }
  } else if (pattern === 'paper') {
    const lcg = (s) => (s * 1664525 + 1013904223) & 0xffffffff;
    let s = 42;
    const rand = () => { s = lcg(s); return (s >>> 0) / 0xffffffff; };

    const fiberCount = layer.strokes ?? 36000;
    pctx.globalAlpha = 0.13;
    for (let i = 0; i < fiberCount; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const len = 15 + rand() * 66;
      const angle = (rand() - 0.5) * 0.10;
      pctx.lineWidth = 0.1 + rand() * 0.18;
      pctx.beginPath();
      pctx.moveTo(x, y);
      pctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      pctx.stroke();
    }

    const dotCount = layer.dots ?? 12000;
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

  const maskDir = layer.mask ?? 'bottom';
  if (maskDir !== 'none') {
    pctx.globalCompositeOperation = 'destination-in';

    if (maskDir === 'noise') {
      const noiseScale = 300;
      const noiseCanvas = createCanvas(W, H);
      const nctx = noiseCanvas.getContext('2d');
      const imgData = nctx.createImageData(W, H);
      const gridW = Math.ceil(W / noiseScale) + 2;
      const gridH = Math.ceil(H / noiseScale) + 2;
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
            lerp(grid[iy][ix], grid[iy][ix + 1], fx),
            lerp(grid[iy + 1][ix], grid[iy + 1][ix + 1], fx),
            fy,
          );
          const idx = (py * W + px) * 4;
          const alpha = Math.round(v * 255);
          imgData.data[idx] = 0;
          imgData.data[idx + 1] = 0;
          imgData.data[idx + 2] = 0;
          imgData.data[idx + 3] = alpha;
        }
      }
      nctx.putImageData(imgData, 0, 0);
      pctx.drawImage(noiseCanvas, 0, 0);
    } else if (maskDir === 'radial') {
      const radius = Math.min(W, H) * 0.55;
      const grad = pctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.4, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
    } else if (maskDir === 'center-v') {
      const grad = pctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
    } else if (maskDir === 'center-h') {
      const grad = pctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
    } else {
      let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
      if (maskDir === 'bottom') { x0 = 0; y0 = 0; x1 = 0; y1 = H; }
      else if (maskDir === 'top') { x0 = 0; y0 = H; x1 = 0; y1 = 0; }
      else if (maskDir === 'right') { x0 = 0; y0 = 0; x1 = W; y1 = 0; }
      else if (maskDir === 'left') { x0 = W; y0 = 0; x1 = 0; y1 = 0; }
      const grad = pctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      pctx.fillStyle = grad;
    }

    pctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = layer.blendMode ?? 'source-over';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

export function renderBackgroundPattern(ctx, theme = {}, tokens, patternContext = {}) {
  const plan = theme.easterEggPlan ?? composeBackgroundPatternPlan(theme, theme.easterEgg, patternContext);
  for (const layer of plan.layers) {
    drawLayerPattern(ctx, layer, tokens);
  }
  return plan;
}
