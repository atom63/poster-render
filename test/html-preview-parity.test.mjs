import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPreviewDocument, loadPreviewContent } from '../preview/preview.mjs';
import { buildPreviewSlides } from '../preview/render-slide.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-preview-parity-'));
}

function extractPreviewMeta(html) {
  const slides = [...html.matchAll(/<article class="slide slide-([^"]+)"[^>]*data-slide-title="([^"]*)"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => {
    const counter = match[3].match(/<span class="slide-counter">([^<]+)<\/span>/)?.[1] ?? '';
    return {
      kind: match[1],
      title: match[2],
      counter,
    };
  });
  return slides;
}

test('canvas export and HTML preview stay aligned on slide order and deck structure', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tmp = makeTempDir();
  const sourcePath = path.join(tmp, 'content.json');
  const canvasOutput = path.join(tmp, 'canvas');
  const imagePath = path.resolve(repoRoot, 'test-screenshot.jpg');

  const content = {
    cover: { title: 'Parity deck', subtitle: 'Canvas and HTML should agree' },
    sections: [
      { headline: 'Intro', body: 'A simple opening section.' },
      {
        headline: 'Media block',
        image: imagePath,
        imageAlt: 'diagram alt text',
        body: [
          { type: 'table', header: ['Name', 'Value'], rows: [['Alpha', '1']] },
          { type: 'code', lang: 'js', content: 'const ok = true;\nconsole.log(ok);' },
        ],
      },
      { headline: 'Wrap up', body: '- one\n- two\n- three' },
    ],
    cta: 'Ship it',
  };

  fs.writeFileSync(sourcePath, JSON.stringify(content, null, 2));

  const { content: previewContent, inputPath } = loadPreviewContent(sourcePath);
  assert.equal(inputPath, sourcePath);

  execFileSync(process.execPath, [path.resolve(repoRoot, 'render.js'), sourcePath, '--output', canvasOutput], {
    stdio: 'pipe',
  });

  const canvasSlides = fs.readdirSync(canvasOutput).filter((name) => name.endsWith('.png')).sort();
  const previewSlides = buildPreviewSlides(previewContent, { sourceDir: tmp });
  const previewHtml = buildPreviewDocument(previewContent, { sourcePath, cssText: '' });
  const meta = extractPreviewMeta(previewHtml);

  assert.equal(canvasSlides.length, 5);
  assert.equal(previewSlides.length, canvasSlides.length);
  assert.deepEqual(meta.map((slide) => slide.kind), ['cover', 'section', 'section', 'section', 'cta']);
  assert.deepEqual(meta.map((slide) => slide.title), ['Parity deck', 'Intro', 'Media block', 'Wrap up', 'Ship it']);
  assert.deepEqual(meta.map((slide) => slide.counter), ['01 / 05', '02 / 05', '03 / 05', '04 / 05', '05 / 05']);
  assert.match(previewHtml, /<figure class="block block-image">/);
  assert.match(previewHtml, /<table class="block block-table">/);
  assert.match(previewHtml, /<section class="block block-code">/);
  assert.match(previewHtml, /alt="diagram alt text"/);
});
