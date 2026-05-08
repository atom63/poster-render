import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  TYPOGRAPHY_PRESETS,
  TYPOGRAPHY_SCALES,
  resolveTypography,
  resolveThemeConfig,
} from '../render-config.js';

const repo = process.cwd();
const nodeBin = process.execPath;
const SEGMENT_PAD = { code: { top: 10, bottom: 4, left: 14, right: 14 } };

const BASE_TOKENS = {
  canvas: { width: 1080, height: 1350 },
  type: {
    title:    { size: 108, weight: '800',    lineHeight: 128 },
    subtitle: { size: 34,  weight: 'normal', lineHeight: 52  },
    headline: { size: 52,  weight: '600',    lineHeight: 70  },
    body:     { size: 34,  weight: 'normal', lineHeight: 51  },
    small:    { size: 22,  weight: 'normal', lineHeight: 34  },
    code:     { size: 30,  weight: 'normal', lineHeight: 48  },
  },
  theme: { palette: 'light', spacing: 'md' },
};

const TYPE_ROLES = ['title', 'subtitle', 'headline', 'body', 'small', 'code'];

// ── TYPOGRAPHY_PRESETS ────────────────────────────────────────────────────────

test('TYPOGRAPHY_PRESETS has sm, md, lg entries with all roles as absolute px', () => {
  assert.ok(TYPOGRAPHY_PRESETS, 'TYPOGRAPHY_PRESETS must be exported');
  for (const key of ['sm', 'md', 'lg']) {
    const preset = TYPOGRAPHY_PRESETS[key];
    assert.ok(preset, `TYPOGRAPHY_PRESETS.${key} must exist`);
    for (const role of TYPE_ROLES) {
      assert.ok(preset[role], `${key}.${role} must exist`);
      assert.ok(Number.isFinite(preset[role].size),       `${key}.${role}.size must be a finite number`);
      assert.ok(Number.isFinite(preset[role].lineHeight), `${key}.${role}.lineHeight must be a finite number`);
      assert.ok(typeof preset[role].weight === 'string',  `${key}.${role}.weight must be a string`);
      assert.ok(preset[role].lineHeight > preset[role].size, `${key}.${role}.lineHeight must exceed size`);
    }
  }
  // sm < md < lg ordering for body size
  assert.ok(TYPOGRAPHY_PRESETS.sm.body.size < TYPOGRAPHY_PRESETS.md.body.size, 'sm body < md body');
  assert.ok(TYPOGRAPHY_PRESETS.md.body.size < TYPOGRAPHY_PRESETS.lg.body.size, 'md body < lg body');
});

test('TYPOGRAPHY_PRESETS md matches current TOKENS defaults exactly', () => {
  const md = TYPOGRAPHY_PRESETS.md;
  assert.equal(md.title.size,    108);
  assert.equal(md.title.weight,  '800');
  assert.equal(md.title.lineHeight, 128);
  assert.equal(md.subtitle.size, 34);
  assert.equal(md.headline.size, 52);
  assert.equal(md.headline.weight, '600');
  assert.equal(md.headline.lineHeight, 70);
  assert.equal(md.body.size,     34);
  assert.equal(md.body.lineHeight, 51);
  assert.equal(md.small.size,    22);
  assert.equal(md.small.lineHeight, 34);
  assert.equal(md.code.size,     30);
  assert.equal(md.code.lineHeight, 48);
});

// ── TYPOGRAPHY_SCALES / resolveTypography ─────────────────────────────────────

test('TYPOGRAPHY_SCALES only exposes golden-ratio and uses ratio/base', () => {
  assert.ok(TYPOGRAPHY_SCALES, 'TYPOGRAPHY_SCALES must be exported');
  const scale = TYPOGRAPHY_SCALES['golden-ratio'];
  assert.ok(scale, 'TYPOGRAPHY_SCALES[\'golden-ratio\'] must exist');
  assert.equal(Object.keys(TYPOGRAPHY_SCALES).length, 1);
  assert.equal(scale.ratio, 1.618);
  assert.equal(scale.base, 34);
});

test('resolveTypography returns null when no typography name given', () => {
  assert.equal(resolveTypography(null,      BASE_TOKENS.type), null);
  assert.equal(resolveTypography(undefined, BASE_TOKENS.type), null);
  assert.equal(resolveTypography('',        BASE_TOKENS.type), null);
});

test('resolveTypography with an unknown name returns null', () => {
  assert.equal(resolveTypography('huge',         BASE_TOKENS.type), null);
  assert.equal(resolveTypography('major-third',  BASE_TOKENS.type), null);
  assert.equal(resolveTypography('minor-third',   BASE_TOKENS.type), null);
});

test('resolveTypography with golden-ratio computes a strong ratio-based scale', () => {
  const type = resolveTypography('golden-ratio', BASE_TOKENS.type);
  assert.ok(type, 'golden-ratio resolvedType must not be null');
  const { ratio, base } = TYPOGRAPHY_SCALES['golden-ratio'];
  assert.equal(type.body.size, base);
  assert.equal(type.headline.size, Math.round(base * ratio * ratio));
  assert.ok(type.title.size > BASE_TOKENS.type.title.size, 'golden-ratio title should exceed base title');
});

test('resolveTypography with sm returns smaller absolute sizes than TOKENS defaults', () => {
  const type = resolveTypography('sm', BASE_TOKENS.type);
  assert.ok(type, 'sm resolvedType must not be null');
  assert.equal(type.body.size,     TYPOGRAPHY_PRESETS.sm.body.size);
  assert.equal(type.headline.size, TYPOGRAPHY_PRESETS.sm.headline.size);
  assert.ok(type.body.size < BASE_TOKENS.type.body.size, 'sm body smaller than default');
});

test('resolveTypography with lg returns larger absolute sizes than TOKENS defaults', () => {
  const type = resolveTypography('lg', BASE_TOKENS.type);
  assert.ok(type, 'lg resolvedType must not be null');
  assert.equal(type.body.size, TYPOGRAPHY_PRESETS.lg.body.size);
  assert.ok(type.body.size > BASE_TOKENS.type.body.size, 'lg body larger than default');
});

test('resolveTypography with md returns sizes identical to TOKENS defaults', () => {
  const type = resolveTypography('md', BASE_TOKENS.type);
  assert.ok(type, 'md resolvedType must not be null');
  assert.equal(type.body.size,     BASE_TOKENS.type.body.size);
  assert.equal(type.headline.size, BASE_TOKENS.type.headline.size);
  assert.equal(type.title.size,    BASE_TOKENS.type.title.size);
});

// ── resolveThemeConfig integration ────────────────────────────────────────────
// ── resolveThemeConfig integration ────────────────────────────────────────────

test('resolveThemeConfig with no typography leaves resolvedType null', () => {
  const theme = resolveThemeConfig({ TOKENS: BASE_TOKENS, SEGMENT_PAD });
  assert.equal(theme.resolvedType, null);
});

test('resolveThemeConfig with cliTypography sm sets resolvedType to sm preset', () => {
  const theme = resolveThemeConfig({ TOKENS: BASE_TOKENS, SEGMENT_PAD, cliTypography: 'sm' });
  assert.ok(theme.resolvedType, 'resolvedType must be set');
  assert.equal(theme.resolvedType.body.size, TYPOGRAPHY_PRESETS.sm.body.size);
  assert.equal(theme.typography, 'sm');
});

test('resolveThemeConfig content theme typography sets resolvedType', () => {
  const theme = resolveThemeConfig({
    TOKENS: BASE_TOKENS,
    SEGMENT_PAD,
    contentTheme: { typography: 'golden-ratio' },
  });
  assert.ok(theme.resolvedType, 'resolvedType must be set');
  const { ratio, base } = TYPOGRAPHY_SCALES['golden-ratio'];
  assert.equal(theme.resolvedType.body.size,     base);
  assert.equal(theme.resolvedType.headline.size, Math.round(base * ratio * ratio));
  assert.equal(theme.typography, 'golden-ratio');
});

test('resolveThemeConfig CLI typography overrides content typography', () => {
  const theme = resolveThemeConfig({
    TOKENS: BASE_TOKENS,
    SEGMENT_PAD,
    contentTheme: { typography: 'lg' },
    cliTypography: 'sm',
  });
  assert.equal(theme.typography,             'sm');
  assert.equal(theme.resolvedType.body.size, TYPOGRAPHY_PRESETS.sm.body.size);
});

test('resolveThemeConfig with invalid typography name leaves resolvedType null', () => {
  const theme = resolveThemeConfig({
    TOKENS: BASE_TOKENS,
    SEGMENT_PAD,
    contentTheme: { typography: 'enormous' },
  });
  assert.equal(theme.resolvedType, null);
});

// ── CLI integration ───────────────────────────────────────────────────────────

test('CLI --typography sm renders without error', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-typo-'));
  const contentJson = path.join(outDir, 'content.json');
  fs.writeFileSync(contentJson, JSON.stringify({
    cover: { title: 'Typography Test', subtitle: 'sm preset' },
    sections: [{ headline: 'Hello', body: 'World' }],
  }));
  assert.doesNotThrow(() => {
    execFileSync(nodeBin, ['render.js', contentJson, '--typography', 'sm', '--output', outDir], {
      cwd: repo, stdio: 'pipe',
    });
  }, 'render with --typography sm must not throw');
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  assert.ok(files.length > 0, 'at least one PNG must be produced');
});

test('CLI --typography golden-ratio renders without error', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-typo-'));
  const contentJson = path.join(outDir, 'content.json');
  fs.writeFileSync(contentJson, JSON.stringify({
    cover: { title: 'Golden Ratio Test', subtitle: 'golden-ratio' },
    sections: [{ headline: 'Ramp', body: 'Stronger scale' }],
  }));
  assert.doesNotThrow(() => {
    execFileSync(nodeBin, ['render.js', contentJson, '--typography', 'golden-ratio', '--output', outDir], {
      cwd: repo, stdio: 'pipe',
    });
  }, 'render with --typography golden-ratio must not throw');
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  assert.ok(files.length > 0, 'at least one PNG must be produced');
});
