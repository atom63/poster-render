import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from 'canvas';
import { COLOR_PALETTES, SPACING_PRESETS, resolveThemeConfig } from '../render-config.js';
import {
  composeBackgroundPatternPlan,
  normalizeEastereggConfig,
} from '../render-pattern.js';

const repo = process.cwd();
const nodeBin = process.execPath;

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-pattern-'));
}

function renderContent(content, outDir) {
  const contentJson = path.join(outDir, 'content.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(contentJson, JSON.stringify(content, null, 2));
  execFileSync(nodeBin, ['render.js', contentJson, '--output', outDir], { cwd: repo, stdio: 'pipe' });
  return contentJson;
}

async function loadSlide(imagePath) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { img, ctx };
}

function sample(ctx, x, y) {
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

function sameColor(a, b, tolerance = 4) {
  return a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}

test('resolveThemeConfig keeps easteregg opt-in and normalizes the config', () => {
  const baseTokens = {
    canvas: { width: 1080, height: 1350 },
    type: {
      code: { size: 30, lineHeight: 48 },
      small: { lineHeight: 34 },
    },
    theme: { palette: 'light', spacing: 'md' },
  };

  const resolvedDefault = resolveThemeConfig({
    TOKENS: baseTokens,
    SEGMENT_PAD: { code: { top: 12, bottom: 12, left: 16, right: 16 } },
  });

  assert.equal(resolvedDefault.easterEgg, null);
  assert.equal(resolvedDefault.palette, 'light');
  assert.equal(resolvedDefault.spacing, 'md');

  const resolvedEnabled = resolveThemeConfig({
    TOKENS: baseTokens,
    SEGMENT_PAD: { code: { top: 12, bottom: 12, left: 16, right: 16 } },
    contentTheme: {
      easterEgg: { mode: 'random-patterns', seed: 7, intensity: 'medium' },
    },
  });

  assert.deepEqual(resolvedEnabled.easterEgg, {
    mode: 'random-patterns',
    seed: '7',
    intensity: 'medium',
  });
});

test('resolveThemeConfig enables easteregg from the CLI', () => {
  const baseTokens = {
    canvas: { width: 1080, height: 1350 },
    type: {
      code: { size: 30, lineHeight: 48 },
      small: { lineHeight: 34 },
    },
    theme: { palette: 'light', spacing: 'md' },
  };

  const resolved = resolveThemeConfig({
    TOKENS: baseTokens,
    SEGMENT_PAD: { code: { top: 12, bottom: 12, left: 16, right: 16 } },
    cliEasterEgg: true,
    cliSeed: 'cli-seed',
  });

  assert.deepEqual(resolved.easterEgg, {
    mode: 'random-patterns',
    seed: 'cli-seed',
    intensity: 'low',
  });
});

test('normalizeEastereggConfig normalizes the easteregg config', () => {
  assert.equal(normalizeEastereggConfig(), null);
  assert.deepEqual(
    normalizeEastereggConfig({ mode: 'random-patterns', seed: 42, intensity: 'low' }),
    normalizeEastereggConfig({ mode: 'random-patterns', seed: '42', intensity: 'low' }),
  );
});

test('composeBackgroundPatternPlan is deterministic and stays within the curated set', () => {
  const theme = {
    pattern: 'line-grid',
    patternSpacing: 48,
    patternOpacity: 0.08,
    patternMask: 'none',
    foreground: '#111111',
    background: '#ffffff',
  };
  const easterEgg = { mode: 'random-patterns', seed: 'deck-123', intensity: 'medium' };
  const context = { deckIdentity: 'deck-a', templateName: 'default' };

  const planA = composeBackgroundPatternPlan(theme, easterEgg, context);
  const planB = composeBackgroundPatternPlan(theme, easterEgg, context);
  const planC = composeBackgroundPatternPlan(theme, { ...easterEgg, seed: 'deck-456' }, context);

  assert.deepEqual(planA, planB);
  assert.notDeepEqual(planA, planC);
  assert.ok(planA.layers.length >= 1 && planA.layers.length <= 2);
  for (const layer of planA.layers) {
    assert.ok(['none', 'dot-grid', 'line-grid', 'diagonal', 'halftone', 'dither', 'ascii', 'paper'].includes(layer.pattern));
    assert.ok(['source-over', 'multiply', 'overlay', 'screen', 'soft-light'].includes(layer.blendMode));
    assert.ok(layer.opacity >= 0.04 && layer.opacity <= 0.16);
  }
});

test('composeBackgroundPatternPlan avoids dense overlays on dense bases', () => {
  const plan = composeBackgroundPatternPlan(
    {
      pattern: 'dither',
      patternSpacing: 3,
      patternOpacity: 0.08,
      patternMask: 'none',
      foreground: '#111111',
      background: '#ffffff',
    },
    { mode: 'random-patterns', seed: 'dense-seed', intensity: 'low' },
    { deckIdentity: 'dense-deck', templateName: 'default' },
  );

  assert.equal(plan.layers[0].pattern, 'dither');
  if (plan.layers[1]) {
    assert.ok(['paper', 'dot-grid'].includes(plan.layers[1].pattern), 'expected dense base to avoid another dense overlay');
  }
});

test('easteregg render is seeded, reproducible, and changes only the background', async () => {
  const tmp = makeTempDir();
  const baselineDir = path.join(tmp, 'baseline');
  const remixDirA = path.join(tmp, 'remix-a');
  const remixDirB = path.join(tmp, 'remix-b');

  const content = {
    theme: {
      palette: 'light',
      spacing: 'sm',
      fontFamily: 'sans',
      pattern: 'line-grid',
      patternMask: 'none',
      patternSpacing: 40,
    },
    cover: {
      title: 'Pattern remix',
      subtitle: 'Background-only easteregg regression test',
    },
    sections: [
      {
        headline: 'Background remix',
        body: [
          { type: 'text', content: 'This text should stay in the same place.' },
          { type: 'text', content: 'The remix only touches the background visuals.' },
        ],
      },
    ],
    cta: 'Done',
  };

  const easterEgg = { mode: 'random-patterns', seed: 'remix-seed-001', intensity: 'medium' };
  renderContent(content, baselineDir);
  renderContent({ ...content, easterEgg }, remixDirA);
  renderContent({ ...content, easterEgg }, remixDirB);

  const baselinePngs = fs.readdirSync(baselineDir).filter((file) => file.endsWith('.png'));
  const remixPngsA = fs.readdirSync(remixDirA).filter((file) => file.endsWith('.png'));
  const remixPngsB = fs.readdirSync(remixDirB).filter((file) => file.endsWith('.png'));
  assert.deepEqual(remixPngsA, remixPngsB);
  assert.deepEqual(baselinePngs, remixPngsA);

  const baselineSlide = await loadSlide(path.join(baselineDir, 'slide-02.png'));
  const remixSlideA = await loadSlide(path.join(remixDirA, 'slide-02.png'));
  const remixSlideB = await loadSlide(path.join(remixDirB, 'slide-02.png'));

  const backgroundPoint = [20, 75];
  assert.ok(!sameColor(sample(baselineSlide.ctx, ...backgroundPoint), sample(remixSlideA.ctx, ...backgroundPoint), 0), 'expected easteregg to change the background pixels');
  assert.ok(sameColor(sample(remixSlideA.ctx, ...backgroundPoint), sample(remixSlideB.ctx, ...backgroundPoint), 0), 'expected the same seed to reproduce the same background pixels');
});

test('composer failures fall back to the standard background pattern path', () => {
  const tmp = makeTempDir();
  const outDir = path.join(tmp, 'out');
  const content = {
    theme: {
      palette: 'light',
      spacing: 'sm',
      fontFamily: 'sans',
      pattern: 'line-grid',
      patternMask: 'none',
      patternSpacing: 0,
    },
    easterEgg: { mode: 'random-patterns', seed: 'force-fallback', intensity: 'low' },
    cover: {
      title: 'Fallback test',
      subtitle: 'The render should still complete',
    },
    sections: [
      {
        headline: 'Fallback test',
        body: [{ type: 'text', content: 'The renderer should not crash.' }],
      },
    ],
  };

  renderContent(content, outDir);
  assert.ok(fs.existsSync(path.join(outDir, 'slide-01.png')));
});
