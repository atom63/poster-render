#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COLOR_PALETTES, SPACING_PRESETS, resolveThemeConfig } from '../src/render-config.js';
import { renderPreviewDeck } from './render-slide.mjs';
import { escapeHtml } from './render-blocks.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const PREVIEW_TOKENS = {
  canvas: { width: 1080, height: 1350 },
  theme: { palette: 'light', fontFamily: 'sans', spacing: 'md' },
  type: {
    title: { size: 121, weight: '800', lineHeight: 144 },
    subtitle: { size: 38, weight: 'normal', lineHeight: 58 },
    headline: { size: 58, weight: '600', lineHeight: 78 },
    body: { size: 38, weight: 'normal', lineHeight: 57 },
    small: { size: 25, weight: 'normal', lineHeight: 38 },
    code: { size: 30, weight: 'normal', lineHeight: 48 },
  },
};

const PREVIEW_SEGMENT_PAD = { code: { top: 0, bottom: 0, left: 0, right: 0 } };

const TEMPLATE_SHIKI_THEMES = {
  minimal: 'github-light',
  bold: 'tokyo-night',
  technical: 'github-dark',
};

function usage() {
  console.error('Usage: node preview/preview.mjs [content.json] [--template minimal|bold|technical] [--output preview.html] [--watch]');
}

function parseArgs(argv) {
  const args = { input: null, output: 'preview.html', template: null, watch: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '--output') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--output requires a file path');
      args.output = next;
    } else if (arg === '--template') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--template requires a name (minimal, bold, technical)');
      args.template = next;
    } else if (arg === '--watch') {
      args.watch = true;
    } else if (!arg.startsWith('-') && !args.input) {
      args.input = arg;
    } else if (!arg.startsWith('-')) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

export function loadPreviewContent(inputPath) {
  const resolvedPath = path.resolve(inputPath);
  const content = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  if (!content.sourceDir) {
    content.sourceDir = path.dirname(resolvedPath);
  }
  return { content, inputPath: resolvedPath };
}

function themeToCssVars(theme, tokens) {
  const palette = COLOR_PALETTES[theme.palette] || COLOR_PALETTES.light;
  const resolvedType = theme.resolvedType || PREVIEW_TOKENS.type;
  const spacing = SPACING_PRESETS[theme.spacing] || SPACING_PRESETS.md;
  const vars = {
    '--slide-width': `${tokens.canvas.width}px`,
    '--slide-height': `${tokens.canvas.height}px`,
    '--deck-bg': theme.background ?? palette.background,
    '--deck-fg': theme.foreground ?? palette.foreground,
    '--deck-muted': theme.mutedForeground ?? palette.mutedForeground,
    '--deck-subtle': theme.subtleForeground ?? palette.subtleForeground,
    '--deck-accent': theme.accent ?? palette.accent,
    '--deck-card-bg': theme.cardBg ?? palette.cardBg ?? palette.background,
    '--deck-card-fg': theme.foreground ?? palette.foreground,
    '--deck-border': `rgba(17, 17, 20, ${theme.borderAlpha ?? palette.borderAlpha ?? 0.12})`,
    '--deck-shadow': theme.shadow ?? '0 40px 120px rgba(17, 17, 20, 0.14)',
    '--deck-radius': `${theme.cardRadius ?? 34}px`,
    '--deck-pad-x': `${spacing.padX}px`,
    '--deck-pad-y': `${spacing.padY}px`,
    '--deck-gap': `${spacing.sectionGap}px`,
    '--deck-title-size': `${resolvedType.title.size}px`,
    '--deck-subtitle-size': `${resolvedType.subtitle.size}px`,
    '--deck-headline-size': `${resolvedType.headline.size}px`,
    '--deck-body-size': `${resolvedType.body.size}px`,
    '--deck-small-size': `${resolvedType.small.size}px`,
    '--deck-code-size': `${theme.codeFontSize ?? resolvedType.code.size}px`,
    '--deck-title-line': (resolvedType.title.lineHeight / resolvedType.title.size).toFixed(2),
    '--deck-subtitle-line': (resolvedType.subtitle.lineHeight / resolvedType.subtitle.size).toFixed(2),
    '--deck-headline-line': (resolvedType.headline.lineHeight / resolvedType.headline.size).toFixed(2),
    '--deck-body-line': (resolvedType.body.lineHeight / resolvedType.body.size).toFixed(2),
    '--deck-small-line': (resolvedType.small.lineHeight / resolvedType.small.size).toFixed(2),
    '--deck-code-line': `${(theme.codeLineHeight ?? resolvedType.code.lineHeight) / (theme.codeFontSize ?? resolvedType.code.size)}`,
    '--deck-font-sans': theme.fontFamily === 'serif' ? 'Georgia, Times New Roman, serif' : 'Helvetica Neue, Helvetica, Arial, sans-serif',
    '--deck-font-serif': 'Georgia, Times New Roman, serif',
    '--deck-font-mono': 'Menlo, Consolas, monospace',
  };
  return Object.entries(vars).map(([key, value]) => `${key}: ${value};`).join(' ');
}

export async function buildPreviewDocument(content, { sourcePath = null, cssText = '', tokens = PREVIEW_TOKENS, template = null } = {}) {
  const resolvedTheme = resolveThemeConfig({
    TOKENS: tokens,
    SEGMENT_PAD: PREVIEW_SEGMENT_PAD,
    contentTheme: content?.theme ?? {},
    colorPalettes: COLOR_PALETTES,
  });

  if (template && TEMPLATE_SHIKI_THEMES[template]) {
    resolvedTheme.codeTheme = TEMPLATE_SHIKI_THEMES[template];
  }

  let templateCss = '';
  if (template) {
    const templatePath = path.resolve(MODULE_DIR, 'templates', `${template}.css`);
    if (fs.existsSync(templatePath)) {
      templateCss = fs.readFileSync(templatePath, 'utf8');
    }
  }

  const sourceDir = content?.sourceDir ?? (sourcePath ? path.dirname(sourcePath) : process.cwd());
  const deck = await renderPreviewDeck({ ...content, theme: resolvedTheme }, { sourceDir, template });
  const style = `${cssText}\n:root { ${themeToCssVars(resolvedTheme, tokens)} }\n${templateCss}`;
  const title = content?.cover?.title ? String(content.cover.title) : 'poster-render preview';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${style}</style>
  </head>
  <body>
    ${deck}
  </body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const inputPath = args.input ? path.resolve(args.input) : path.resolve(MODULE_DIR, '../examples/sample-content.json');
  const outputPath = path.resolve(args.output);
  const cssPath = path.resolve(MODULE_DIR, 'preview.css');
  const cssText = fs.readFileSync(cssPath, 'utf8');

  async function build() {
    const { content, inputPath: resolvedInput } = loadPreviewContent(inputPath);
    const html = await buildPreviewDocument(content, { sourcePath: resolvedInput, cssText, template: args.template });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html);
    console.error(`[preview] wrote ${outputPath}`);
  }

  await build();

  if (args.watch) {
    console.error(`[preview] watching ${inputPath} for changes…`);
    fs.watch(inputPath, async () => {
      try { await build(); } catch (e) { console.error(`[preview] rebuild error: ${e.message}`); }
    });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    console.error(`[preview] ${err?.stack || err?.message || err}`);
    process.exit(1);
  });
}
