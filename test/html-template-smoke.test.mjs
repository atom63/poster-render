import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreviewDocument } from '../preview/preview.mjs';
import { exportPreviewPng } from '../preview/export-png.mjs';
import { parseMarkdown } from '../src/markdown-to-content.js';

const RENDER_DIR = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE = {
  cover: { title: 'Smoke test', subtitle: 'Templates' },
  sections: [{ headline: 'S1', body: [{ type: 'text', content: 'Body.' }] }],
  cta: 'Done',
};

test('data-template attribute appears on .deck when template is set', async () => {
  const html = await buildPreviewDocument(SAMPLE, { cssText: '', template: 'technical' });
  assert.match(html, /class="deck" data-template="technical"/);
});

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-template-smoke-'));
}

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  assert.equal(buf.readUInt32BE(12), 0x49484452);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const tmpl of ['minimal', 'bold', 'technical']) {
  test(`${tmpl} template: exportPreviewPng produces 3 slides at 1080×1350`, async () => {
    const tmp = makeTempDir();
    const outputDir = path.join(tmp, 'out');
    const files = await exportPreviewPng(SAMPLE, {
      sourcePath: path.join(tmp, 'c.json'),
      outputDir,
      cssText: '',
      template: tmpl,
    });
    assert.equal(files.length, 3);
    for (const file of files) {
      assert.ok(fs.existsSync(file), `${file} should exist`);
      assert.deepEqual(readPngDimensions(file), { width: 1080, height: 1350 });
    }
  });
}

test('.md auto-detection via render.js CLI', async () => {
  const { spawnSync } = await import('node:child_process');
  const tmpMd = path.join(os.tmpdir(), `test-deck-${Date.now()}.md`);
  const tmpOut = path.join(os.tmpdir(), `test-out-${Date.now()}`);
  try {
    fs.writeFileSync(tmpMd, '# My Deck\n\nHello world.\n');
    const result = spawnSync(
      process.execPath,
      [path.resolve(RENDER_DIR, '../render.js'), tmpMd, '--template', 'minimal', '--output', tmpOut],
      { cwd: path.resolve(RENDER_DIR, '..'), encoding: 'utf8', timeout: 60_000 }
    );
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, `render.js exited ${result.status}: ${result.stderr}`);
    const files = fs.readdirSync(tmpOut).filter(f => f.endsWith('.png'));
    assert.ok(files.length > 0, 'Expected at least one PNG output');
  } finally {
    try { fs.unlinkSync(tmpMd); } catch {}
    try { fs.rmSync(tmpOut, { recursive: true }); } catch {}
  }
});
