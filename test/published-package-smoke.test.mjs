import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repo = process.cwd();

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-pack-'));
}

test('published tarball installs and exposes the poster-render bin', () => {
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
  execFileSync('npm', ['install', '--silent', tarball], { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] });

  const binPath = path.join(installDir, 'node_modules', '.bin', 'poster-render');
  assert.ok(fs.existsSync(binPath), 'expected poster-render bin to exist after install');

  const helpRun = spawnSync(binPath, ['--help'], { cwd: installDir, encoding: 'utf8' });
  assert.equal(helpRun.status, 0, helpRun.stderr);
  assert.match(`${helpRun.stdout}${helpRun.stderr}`, /Usage:/i);
  assert.match(`${helpRun.stdout}${helpRun.stderr}`, /--help/i);
});