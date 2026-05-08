import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPreviewContent } from '../preview/preview.mjs';
import { exportPreviewPng } from '../preview/export-png.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-preview-export-'));
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  assert.equal(buffer.readUInt32BE(12), 0x49484452);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('html preview export writes one PNG per slide at poster size', async () => {
  const tmp = makeTempDir();
  const sourcePath = path.join(tmp, 'content.json');
  const content = {
    cover: { title: 'Export deck', subtitle: 'PNG export' },
    sections: [
      { headline: 'First section', body: 'First body' },
    ],
    cta: 'Done',
  };
  fs.writeFileSync(sourcePath, JSON.stringify(content, null, 2));

  const { content: previewContent, inputPath: loadedPath } = loadPreviewContent(sourcePath);
  const outputDir = path.join(tmp, 'export');
  const files = await exportPreviewPng(previewContent, { sourcePath: loadedPath, outputDir, cssText: '' });

  assert.equal(files.length, 3);
  assert.deepEqual(
    files.map((file) => path.basename(file)),
    ['slide-01.png', 'slide-02.png', 'slide-03.png'],
  );

  for (const file of files) {
    assert.ok(fs.statSync(file).size > 0);
    assert.deepEqual(readPngDimensions(file), { width: 1080, height: 1350 });
  }
});
