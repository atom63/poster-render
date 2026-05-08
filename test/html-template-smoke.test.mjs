import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewDocument } from '../preview/preview.mjs';

const SAMPLE = {
  cover: { title: 'Smoke test', subtitle: 'Templates' },
  sections: [{ headline: 'S1', body: [{ type: 'text', content: 'Body.' }] }],
  cta: 'Done',
};

test('data-template attribute appears on .deck when template is set', async () => {
  const html = await buildPreviewDocument(SAMPLE, { cssText: '', template: 'technical' });
  assert.match(html, /class="deck" data-template="technical"/);
});
