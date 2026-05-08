import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPreviewDocument } from '../preview/preview.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-preview-rendering-'));
}

test('preview renderer maps core markdown blocks into semantic HTML', async () => {
  const tmp = makeTempDir();
  const asset = path.join(tmp, 'diagram.png');
  fs.writeFileSync(asset, 'png');

  const content = {
    theme: { palette: 'light', spacing: 'md', fontFamily: 'sans' },
    cover: { title: 'Semantic preview', subtitle: 'Blocks', kicker: 'Deck preview' },
    sections: [
      {
        headline: 'Block coverage',
        image: './diagram.png',
        imageAlt: 'diagram alt text',
        body: [
          { type: 'text', content: 'Paragraph one.\n\nParagraph two with `inline code`.' },
          { type: 'callout', content: 'Callout content' },
          { type: 'list', content: '- one\n- two\n- three' },
          { type: 'list', content: '- [x] done\n- [ ] todo' },
          { type: 'code', lang: 'js', content: 'const value = 1;\nconsole.log(value);' },
          { type: 'table', header: ['Name', 'Value'], rows: [['Alpha', '1'], ['Beta', '2']], alignments: ['left', 'right'] },
        ],
      },
    ],
  };

  const html = await buildPreviewDocument(content, { sourcePath: path.join(tmp, 'content.json'), cssText: '' });

  assert.match(html, /<header class="cover">/);
  assert.match(html, /<header class="section-header">/);
  assert.match(html, /<section class="block block-callout">/);
  assert.match(html, /<ul class="block-list block-list--unordered">/);
  assert.match(html, /<ul class="block-list block-list--task">/);
  assert.match(html, /<input type="checkbox" disabled checked/);
  assert.match(html, /<pre><code class="language-js">[\s\S]*<span style="color:/);
  assert.match(html, /<thead><tr><th>Name<\/th><th>Value<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td style="text-align:left;">Alpha<\/td><td style="text-align:right;">1<\/td><\/tr>/);
  assert.match(html, /alt="diagram alt text"/);
  assert.match(html, /file:\/\//);
  assert.match(html, /<code class="inline-code">inline code<\/code>/);
});
