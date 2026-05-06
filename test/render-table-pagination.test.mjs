import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from 'canvas';
import { countWrappedCodeLines, measureCodeHeight, estimateCoverKicker } from '../render.js';
import { planSectionPages } from '../render-pagination.js';
import { loadSectionImage } from '../render-image.js';
import { measureSectionHeight } from '../render-segments.js';

const repo = process.cwd();
const nodeBin = process.execPath;

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-table-'));
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

function countContentBlocks(ctx, sampleX, backgroundX = 10) {
  let blocks = 0;
  let inBlock = false;
  for (let y = 0; y < ctx.canvas.height; y++) {
    const isContent = !sameColor(sample(ctx, sampleX, y), sample(ctx, backgroundX, y));
    if (isContent && !inBlock) {
      blocks += 1;
      inBlock = true;
    } else if (!isContent && inBlock) {
      inBlock = false;
    }
  }
  return blocks;
}

function getContentBlocks(ctx, sampleX, backgroundX = 10) {
  const blocks = [];
  let start = null;
  for (let y = 0; y < ctx.canvas.height; y++) {
    const isContent = !sameColor(sample(ctx, sampleX, y), sample(ctx, backgroundX, y));
    if (isContent && start === null) {
      start = y;
    } else if (!isContent && start !== null) {
      blocks.push({ start, end: y - 1, height: y - start });
      start = null;
    }
  }
  if (start !== null) {
    blocks.push({ start, end: ctx.canvas.height - 1, height: ctx.canvas.height - start });
  }
  return blocks;
}

test('renders markdown tables as real tables and paginates tall ones', () => {
  const tmp = makeTempDir();
  const mdPath = path.join(tmp, 'input.md');
  const contentJson = path.join(tmp, 'content.json');
  const outDir = path.join(tmp, 'out');

  const rows = Array.from({ length: 36 }, (_, index) => `| Row ${index + 1} | Value ${index + 1} |`).join('\n');
  const markdown = `# Table demo\nIntro paragraph.\n\n## Tall table\nSome context before the table.\n\n| Name | Value |\n| :--- | ---: |\n${rows}\n`;

  fs.writeFileSync(mdPath, markdown);
  execFileSync(nodeBin, ['markdown-to-content.js', mdPath, '--output', contentJson], { cwd: repo, stdio: 'pipe' });
  const parsed = JSON.parse(fs.readFileSync(contentJson, 'utf8'));
  const tableSection = parsed.sections.find((section) => section.headline === 'Tall table');
  assert.ok(tableSection, 'expected tall table section to exist');
  assert.equal(tableSection.body.at(-1).type, 'table');
  assert.equal(tableSection.body.at(-1).header[0], 'Name');

  execFileSync(nodeBin, ['render.js', contentJson, '--output', outDir], { cwd: repo, stdio: 'pipe' });
  const pngs = fs.readdirSync(outDir).filter((file) => file.endsWith('.png'));
  assert.ok(pngs.length >= 4, `expected paginated slides, got ${pngs.length}`);
});

test('table card leaves bottom padding as slide background', async () => {
  const tmp = makeTempDir();
  const outDir = path.join(tmp, 'out');

  const content = {
    theme: { palette: 'light', spacing: 'sm', fontFamily: 'sans' },
    cover: {
      title: 'Table background check',
      subtitle: 'Regression test',
    },
    cta: 'Thanks',
    sections: [
      {
        headline: 'Table background check',
        body: [
          {
            type: 'table',
            header: ['Name', 'Value'],
            rows: [
              ['Alpha', '1'],
              ['Beta', '2'],
            ],
          },
        ],
      },
    ],
  };

  renderContent(content, outDir);

  const { img, ctx } = await loadSlide(path.join(outDir, 'slide-02.png'));
  const x = 72;
  let sawCard = false;
  let gapY = null;
  for (let y = 0; y < img.height; y++) {
    const px = sample(ctx, x, y);
    if (!sawCard && !sameColor(px, sample(ctx, 10, y))) {
      sawCard = true;
      continue;
    }
    if (sawCard && sameColor(px, sample(ctx, 10, y))) {
      gapY = y;
      break;
    }
  }

  assert.ok(sawCard, 'expected to hit the table card');
  assert.ok(gapY !== null, 'expected the card fill to stop before the slide bottom');
  assert.ok(sameColor(sample(ctx, x, gapY + 2), sample(ctx, 10, gapY + 2)), 'expected bottom padding area to use slide background');
});

test('renders representative theme, spacing, and font combinations', () => {
  const variants = [
    { name: 'light-sm-sans', theme: { palette: 'light', spacing: 'sm', fontFamily: 'sans' } },
    { name: 'warm-md-serif', theme: { palette: 'warm', spacing: 'md', fontFamily: 'serif' } },
    { name: 'slate-lg-sans', theme: { palette: 'slate', spacing: 'lg', fontFamily: 'sans' } },
    { name: 'teal-sm-mono', theme: { palette: 'teal', spacing: 'sm', fontFamily: 'mono' } },
  ];

  for (const variant of variants) {
    const tmp = makeTempDir();
    const outDir = path.join(tmp, variant.name);
    const content = {
      theme: variant.theme,
      cover: {
        title: `Smoke ${variant.name}`,
        subtitle: 'Render check',
      },
      cta: 'Thanks',
      sections: [
        {
          headline: `Smoke ${variant.name}`,
          body: [
            {
              type: 'table',
              header: ['Name', 'Value'],
              rows: [
                ['Alpha', '1'],
                ['Beta', '2'],
              ],
            },
          ],
        },
      ],
    };

    renderContent(content, outDir);
    const pngs = fs.readdirSync(outDir).filter((file) => file.endsWith('.png'));
    assert.ok(pngs.length >= 2, `expected rendered slides for ${variant.name}, got ${pngs.length}`);
    assert.ok(fs.existsSync(path.join(outDir, 'slide-02.png')), `expected slide-02.png for ${variant.name}`);
  }
});

test('renders body text after a table in the same section', async () => {
  const tmp = makeTempDir();
  const outDir = path.join(tmp, 'out');

  const content = {
    theme: { palette: 'light', spacing: 'sm', fontFamily: 'sans' },
    cover: {
      title: 'Table then body',
      subtitle: 'Regression test',
    },
    cta: 'Thanks',
    sections: [
      {
        headline: 'Table then body',
        body: [
          {
            type: 'table',
            header: ['Name', 'Value'],
            rows: [
              ['Alpha', '1'],
              ['Beta', '2'],
            ],
          },
          {
            type: 'text',
            content: 'After table paragraph should still render and stay separate from the table block.',
          },
        ],
      },
    ],
  };

  renderContent(content, outDir);

  const { ctx } = await loadSlide(path.join(outDir, 'slide-02.png'));
  const sampleX = 72;
  const blocks = countContentBlocks(ctx, sampleX);
  assert.ok(blocks >= 3, `expected headline, table, and body blocks; got ${blocks}`);
});

test('auto-generates a reading-time kicker from deck text', () => {
  const content = {
    cover: {
      title: 'AI Agent 产品怎么定价才不亏钱？',
      subtitle: '先算 unit economics，再选 seat / usage / workflow / outcome',
    },
    sections: [
      {
        headline: 'Why this matters',
        body: [
          { type: 'text', content: 'One two three four five six seven eight nine ten.' },
          { type: 'callout', content: 'Callout text' },
          {
            type: 'table',
            header: ['Name', 'Value'],
            rows: [['Alpha', '1'], ['Beta', '2']],
          },
        ],
      },
    ],
    cta: 'Ship it',
  };

  const kicker = estimateCoverKicker(content);
  assert.match(kicker, /^全文 \d+字 · \d+分钟阅读$/);
  assert.ok(!kicker.includes('AI Agent 产品怎么定价才不亏钱？'));
});

test('measureSectionHeight reserves space for emoji fallback text', () => {
  const section = {
    body: [{ type: 'callout', emoji: '🚀', content: 'hello' }],
  };

  const height = measureSectionHeight(
    section,
    'headline-font',
    'body-font',
    40,
    24,
    { contentWidth: 200, headlineToBody: 12 },
    {},
    0,
    {
      TOKENS: { type: { body: { size: 20 }, code: { size: 20, lineHeight: 24 } } },
      antiWidowWidth: () => 120,
      measureTextHeight: (text) => (text.startsWith('>> ') ? 96 : 48),
      measureCodeHeight: () => 0,
      measureTableSegmentHeight: () => 0,
      isEmoji: () => true,
      resolveThemeNumber: (value, fallback) => (value ?? fallback),
      measureCtx: {},
      prepareWithSegments: () => ({}),
      layoutNextLine: () => null,
      paragraphGap: 1,
      EMOJI_ASCII_FALLBACK: { '🚀': '>>' },
    },
  );

  assert.equal(height, 136);
});


test('planSectionPages keeps image sections on a fresh page and respects height limits', () => {
  const sections = [
    { id: 'first' },
    { id: 'image' },
    { id: 'tail' },
  ];

  const pages = planSectionPages(sections, {
    availableHeight: 80,
    getSectionHeight: (section) => {
      if (section.id === 'first') return 40;
      if (section.id === 'image') return 35;
      return 20;
    },
    getSectionGap: () => 10,
    getSectionImage: (section) => (section.id === 'image' ? { drawH: 60 } : null),
  });

  assert.deepEqual(pages, [[0], [1, 2]]);

  const noImagePages = planSectionPages([{ id: 'a' }, { id: 'b' }, { id: 'c' }], {
    availableHeight: 90,
    getSectionHeight: (section) => ({ a: 30, b: 30, c: 35 })[section.id],
    getSectionGap: () => 10,
  });

  assert.deepEqual(noImagePages, [[0, 1], [2]]);
});

test('loadSectionImage crops and scales section images deterministically', async () => {
  const tmp = makeTempDir();
  const imagePath = path.join(tmp, 'source.png');
  const canvas = createCanvas(100, 400);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));

  const loaded = await loadSectionImage(imagePath, 300, 150, 'free', 'top');
  assert.ok(loaded);
  assert.equal(loaded.srcX, 0);
  assert.equal(loaded.srcY, 0);
  assert.equal(loaded.srcW, 100);
  assert.equal(loaded.srcH, 400);
  assert.equal(loaded.drawH, 150);
  assert.equal(loaded.drawW, 38);
});

test('measures long code tokens using wrapped line count', () => {
  const canvas = createCanvas(2000, 100);
  const ctx = canvas.getContext('2d');
  const fontSize = 30;
  const lineHeight = 48;
  const maxWidth = 852;
  const font = `${fontSize}px "Menlo", Consolas, monospace`;
  ctx.font = font;

  const token = 'a'.repeat(100);
  const code = Array.from({ length: 10 }, (_, index) => `const token${index} = \"${token}\";`).join('\n');
  const expectedLines = code.split('\n').reduce(
    (sum, line) => sum + countWrappedCodeLines(ctx, line, maxWidth),
    0,
  );

  assert.ok(expectedLines >= 20, `expected the long token sample to wrap to many visual lines, got ${expectedLines}`);
  assert.equal(measureCodeHeight(ctx, code, fontSize, lineHeight, maxWidth), expectedLines * lineHeight);
});

test('renders long code blocks on the real PNG output without overflow', async () => {
  const tmp = makeTempDir();
  const outDir = path.join(tmp, 'out');

  const code = `const result = ${Array.from({ length: 120 }, (_, index) => `word${index}`).join(' + ')};`;
  const content = {
    theme: { palette: 'light', spacing: 'sm', fontFamily: 'mono' },
    cover: {
      title: 'Code overflow check',
      subtitle: 'Regression test',
    },
    cta: 'Thanks',
    sections: [
      {
        headline: 'Code block',
        body: [
          {
            type: 'code',
            lang: 'javascript',
            content: code,
          },
        ],
      },
    ],
  };

  renderContent(content, outDir);

  const { img, ctx } = await loadSlide(path.join(outDir, 'slide-02.png'));
  const sampleX = 150; // inside the rendered code text area, not just the left padding
  const blocks = getContentBlocks(ctx, sampleX);
  assert.ok(blocks.length >= 1, `expected to find the code card block, got ${blocks.length}`);

  const codeBlock = blocks.at(-1);
  assert.ok(codeBlock, 'expected to find a code card block');
  assert.ok(codeBlock.height > 120, `expected the code card to span multiple wrapped lines, got ${codeBlock.height}`);
  assert.ok(
    sameColor(sample(ctx, sampleX, codeBlock.end + 2), sample(ctx, 10, codeBlock.end + 2)),
    'expected background below the code card'
  );
  assert.ok(img.height > codeBlock.end + 2, 'expected the sampled code card to stay within the slide');
});
