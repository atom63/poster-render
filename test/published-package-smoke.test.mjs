import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-pack-'));
}

test('published tarball installs and renders through the installed bin', () => {
  const tmp = makeTempDir();
  const packDir = path.join(tmp, 'pack');
  const installDir = path.join(tmp, 'install');
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'package.json'), JSON.stringify({ name: 'poster-render-smoke', private: true }, null, 2));

  const packJson = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', packDir],
    { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const packed = JSON.parse(packJson);
  assert.ok(Array.isArray(packed) && packed[0]?.filename, 'expected npm pack json output');

  const tarball = path.join(packDir, packed[0].filename);
  execFileSync(
    'npm',
    ['install', '--prefer-offline', '--no-audit', '--no-fund', tarball],
    { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const contentPath = path.join(installDir, 'content.json');
  const outputDir = path.join(installDir, 'rendered');
  fs.writeFileSync(
    contentPath,
    JSON.stringify(
      {
        cover: { title: 'Smoke test', subtitle: 'Installed package render' },
        sections: [
          {
            headline: 'Installed package render',
            body: [{ type: 'text', content: 'This slide comes from the packed package.' }],
          },
        ],
        cta: 'Done',
      },
      null,
      2,
    ),
  );

  execFileSync(
    'npm',
    ['exec', '--silent', '--', 'poster-render', contentPath, '--output', outputDir],
    { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const pngs = fs.readdirSync(outputDir).filter((file) => file.endsWith('.png'));
  assert.ok(pngs.length >= 2, `expected rendered slides from installed package, got ${pngs.length}`);
  assert.ok(fs.existsSync(path.join(outputDir, 'slide-01.png')), 'expected cover slide from installed package');
});
