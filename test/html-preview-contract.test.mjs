import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPreviewDocument, loadPreviewContent } from '../preview/preview.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-preview-contract-'));
}

test('preview document preserves slide ordering and deck metadata from content.json', async () => {
  const tmp = makeTempDir();
  const sourcePath = path.join(tmp, 'content.json');
  const content = {
    cover: { title: 'Preview deck', subtitle: 'Contract test' },
    sections: [
      { headline: 'Alpha', body: 'Alpha body' },
      { headline: 'Beta', body: 'Beta body' },
    ],
    cta: 'Ship it',
  };
  fs.writeFileSync(sourcePath, JSON.stringify(content, null, 2));

  const { content: previewContent, inputPath: loadedPath } = loadPreviewContent(sourcePath);
  assert.equal(loadedPath, sourcePath);

  const html = await buildPreviewDocument(previewContent, { sourcePath, cssText: '' });

  const slides = [...html.matchAll(/<article class="slide slide-([^\"]+)"[^>]*data-slide-title="([^"]*)"/g)].map((match) => ({
    kind: match[1],
    title: match[2],
  }));

  assert.equal(slides.length, 4);
  assert.deepEqual(slides.map((slide) => slide.kind), ['cover', 'section', 'section', 'cta']);
  assert.deepEqual(slides.map((slide) => slide.title), ['Preview deck', 'Alpha', 'Beta', 'Ship it']);
  assert.match(html, /--slide-width: 1080px;/);
  assert.match(html, /--slide-height: 1350px;/);
  assert.match(html, /<main class="deck"/);
});
