import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = path.resolve('/Users/yz/Documents/GitHub/poster-render');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-table-'));
}

test('renders markdown tables as real tables and paginates tall ones', () => {
  const tmp = makeTempDir();
  const mdPath = path.join(tmp, 'input.md');
  const contentJson = path.join(tmp, 'content.json');
  const outDir = path.join(tmp, 'out');

  const rows = Array.from({ length: 36 }, (_, index) => `| Row ${index + 1} | Value ${index + 1} |`).join('\n');
  const markdown = `# Table demo\nIntro paragraph.\n\n## Tall table\nSome context before the table.\n\n| Name | Value |\n| :--- | ---: |\n${rows}\n`;

  fs.writeFileSync(mdPath, markdown);
  execFileSync('node', ['markdown-to-content.js', mdPath, '--output', contentJson], { cwd: repo, stdio: 'pipe' });
  const parsed = JSON.parse(fs.readFileSync(contentJson, 'utf8'));
  const tableSection = parsed.sections.find((section) => section.headline === 'Tall table');
  assert.ok(tableSection, 'expected tall table section to exist');
  assert.equal(tableSection.body.at(-1).type, 'table');
  assert.equal(tableSection.body.at(-1).header[0], 'Name');

  execFileSync('node', ['render.js', contentJson, '--output', outDir], { cwd: repo, stdio: 'pipe' });
  const pngs = fs.readdirSync(outDir).filter((file) => file.endsWith('.png'));
  assert.ok(pngs.length >= 4, `expected paginated slides, got ${pngs.length}`);
});
