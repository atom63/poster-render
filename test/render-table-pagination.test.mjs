import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from 'canvas';

const repo = process.cwd();
const nodeBin = process.execPath;

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-table-'));
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
  const contentJson = path.join(tmp, 'content.json');
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

  fs.writeFileSync(contentJson, JSON.stringify(content, null, 2));
  execFileSync(nodeBin, ['render.js', contentJson, '--output', outDir], { cwd: repo, stdio: 'pipe' });

  const imagePath = path.join(outDir, 'slide-02.png');
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const sample = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  const same = (a, b, tolerance = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
  const background = sample(10, 10);
  const x = 72;

  let sawCard = false;
  let gapY = null;
  for (let y = 0; y < img.height; y++) {
    const px = sample(x, y);
    if (!sawCard && !same(px, background)) {
      sawCard = true;
      continue;
    }
    if (sawCard && same(px, background)) {
      gapY = y;
      break;
    }
  }

  assert.ok(sawCard, 'expected to hit the table card');
  assert.ok(gapY !== null, 'expected the card fill to stop before the slide bottom');
  assert.ok(same(sample(x, gapY + 2), background), 'expected bottom padding area to use slide background');
});
