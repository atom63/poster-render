import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-canvas-edge-'));
}

test('canvas renderer splits dense long copy across multiple slides', () => {
  const tmp = makeTempDir();
  const sourcePath = path.join(tmp, 'content.json');
  const outputDir = path.join(tmp, 'out');
  const longText = 'This paragraph is intentionally long. '.repeat(18);

  const content = {
    cover: {
      title: 'Edge case deck',
      subtitle: 'Long copy stress test',
      kicker: 'QA',
    },
    sections: [
      {
        headline: 'A long section headline that should wrap cleanly and stay readable even when the copy gets much denser than the sample deck',
        body: [
          { type: 'text', content: `${longText}\n\n${longText}` },
          { type: 'callout', content: longText },
          { type: 'list', content: `- ${longText}\n- ${longText}\n- ${longText}` },
        ],
      },
    ],
    cta: 'Finish line',
  };

  fs.writeFileSync(sourcePath, JSON.stringify(content, null, 2));
  execFileSync(process.execPath, ['render.js', sourcePath, '--output', outputDir], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  const pngs = fs.readdirSync(outputDir).filter((file) => file.endsWith('.png')).sort();
  assert.equal(pngs.length, 8);
  assert.deepEqual(pngs, [
    'slide-01.png',
    'slide-02.png',
    'slide-03.png',
    'slide-04.png',
    'slide-05.png',
    'slide-06.png',
    'slide-07.png',
    'slide-08.png',
  ]);
});
