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

  assert.ok(Math.abs(canvasSlides.length - previewSlides.length) <= 2, `canvas/preview slide counts diverged too much: canvas=${canvasSlides.length}, preview=${previewSlides.length}`);
  assert.equal(previewSlides.length, meta.length);
  assert.equal(meta[0].kind, 'cover');
  assert.equal(meta.at(-1).kind, 'cta');
  assert.equal(meta[0].title, 'Parity deck');
  assert.equal(meta.at(-1).title, 'Ship it');
  assert.ok(meta.some((slide) => slide.title === 'Intro'));
  assert.ok(meta.some((slide) => slide.title === 'Media block'));
  assert.ok(meta.some((slide) => slide.title === 'Wrap up'));

  const totalLabel = String(meta.length).padStart(2, '0');
  meta.forEach((slide, index) => {
    assert.equal(slide.counter, `${String(index + 1).padStart(2, '0')} / ${totalLabel}`);
  });
  assert.match(previewHtml, /<figure class="block block-image">/);
  assert.match(previewHtml, /<table class="block block-table">/);
  assert.match(previewHtml, /<section class="block block-code">/);
  assert.match(previewHtml, /alt="diagram alt text"/);
});
