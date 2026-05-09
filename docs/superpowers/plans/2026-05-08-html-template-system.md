# HTML Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the HTML+Playwright render path to primary by adding three distinct CSS-only templates (Minimal, Bold, Technical) and routing `render.js --template <name>` through that path to produce PNGs.

**Architecture:** Each template is a single CSS file under `preview/templates/` that overrides CSS custom properties and adds scoped decorative rules via `[data-template="<name>"]` selectors. The existing `preview/preview.css` gets new custom-property hooks so template CSS can override component colors without touching structural rules. `render.js` gains `--template`, `--json`, and `.md` auto-detection; canvas path is untouched.

**Tech Stack:** Node.js ESM, CSS custom properties, Playwright (already installed), Shiki (already installed), node:test

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `preview/preview.css` | Modify | Add 7 new CSS custom properties; wire `.cover-title`/`.section-title`/`.cta-title` to `--deck-font-display` |
| `preview/templates/minimal.css` | Create | Minimal identity: cream/serif/thin-rule |
| `preview/templates/bold.css` | Create | Bold identity: black/accent/uppercase/color-block footer |
| `preview/templates/technical.css` | Create | Technical identity: midnight/dot-grid/mono/GitHub-style blocks |
| `preview/render-slide.mjs` | Modify | Accept `template` option in `renderPreviewDeck`; emit `data-template` attribute |
| `preview/preview.mjs` | Modify | Accept `template` in `buildPreviewDocument`; load template CSS; set Shiki theme override |
| `preview/export-png.mjs` | Modify | Accept `template` in `exportPreviewPng` and CLI `parseArgs` |
| `render.js` | Modify | Add `--template`, `--json` flags; add `.md` auto-detection; route to HTML path when `--template` is set |
| `test/html-template-smoke.test.mjs` | Create | Template render smoke tests, `data-template` attribute test, `.md` auto-detection test |

---

## Task 1: CSS Foundation — new custom properties in preview.css

**Files:**
- Modify: `preview/preview.css`

- [ ] **Step 1: Add 7 new custom properties to the `:root` block**

In `preview/preview.css`, find the `:root` block (ends at line 33) and add these lines before the closing `}`:

```css
  --deck-font-display: var(--deck-font-sans);
  --deck-callout-bg: rgba(17, 17, 20, 0.05);
  --deck-callout-border: rgba(17, 17, 20, 0.55);
  --deck-code-bg: rgba(17, 17, 20, 0.06);
  --deck-code-border: rgba(17, 17, 20, 0.1);
  --deck-table-border: rgba(17, 17, 20, 0.12);
  --deck-table-header-bg: rgba(17, 17, 20, 0.05);
```

- [ ] **Step 2: Wire `--deck-font-display` to title elements**

Find `.cover-title` rule and add `font-family: var(--deck-font-display);`:

```css
.cover-title {
  margin: 0;
  font-size: var(--deck-title-size);
  line-height: var(--deck-title-line);
  font-weight: 800;
  letter-spacing: -0.05em;
  font-family: var(--deck-font-display);
}
```

Find `.section-title, .cta-title` rule and add the same property:

```css
.section-title,
.cta-title {
  margin: 0;
  font-size: var(--deck-headline-size);
  line-height: var(--deck-headline-line);
  font-weight: 700;
  letter-spacing: -0.04em;
  font-family: var(--deck-font-display);
}
```

- [ ] **Step 3: Replace hardcoded RGBA values in block components**

Replace the `.block-callout` rule:

```css
.block-callout {
  padding: 26px 28px;
  border-radius: 24px;
  border-left: 6px solid var(--deck-callout-border);
  background: var(--deck-callout-bg);
  font-size: var(--deck-body-size);
  line-height: var(--deck-body-line);
}
```

Replace the `.block-code` rule:

```css
.block-code {
  padding: 24px 28px;
  border-radius: 24px;
  background: var(--deck-code-bg);
  border: 1px solid var(--deck-code-border);
  display: grid;
  gap: 12px;
}
```

Replace the `.block-table` rule:

```css
.block-table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 28px;
  line-height: 1.38;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid var(--deck-table-border);
}
```

Replace the `.block-table th, .block-table td` rule:

```css
.block-table th,
.block-table td {
  padding: 16px 18px;
  border-bottom: 1px solid var(--deck-table-border);
  vertical-align: top;
}
```

Replace the `.block-table thead th` rule:

```css
.block-table thead th {
  background: var(--deck-table-header-bg);
  font-weight: 700;
}
```

- [ ] **Step 4: Verify the file renders the default (light) preview unchanged**

```bash
node preview/preview.mjs examples/sample-content.json --output /tmp/preview-check.html
```

Expected: `[preview] wrote /tmp/preview-check.html` — open the file and confirm slides look the same as before (no visual regression). No test command — manual visual check.

- [ ] **Step 5: Commit**

```bash
git add preview/preview.css
git commit -m "feat: extract block colors to CSS custom properties for template overrides"
```

---

## Task 2: Template CSS Files

**Files:**
- Create: `preview/templates/minimal.css`
- Create: `preview/templates/bold.css`
- Create: `preview/templates/technical.css`

- [ ] **Step 1: Create `preview/templates/` directory and `minimal.css`**

```bash
mkdir -p preview/templates
```

Create `preview/templates/minimal.css`:

```css
[data-template="minimal"] {
  --deck-card-bg: #FAF9F6;
  --deck-card-fg: #111111;
  --deck-accent: #111111;
  --deck-muted: #888888;
  --deck-subtle: #BBBBBB;
  --deck-border: rgba(17, 17, 20, 0.07);
  --deck-shadow: 0 2px 24px rgba(17, 17, 20, 0.06);
  --deck-radius: 0px;
  --deck-font-display: Georgia, "Times New Roman", serif;
  --deck-callout-bg: transparent;
  --deck-callout-border: rgba(17, 17, 20, 0.35);
  --deck-code-bg: rgba(17, 17, 20, 0.04);
  --deck-code-border: rgba(17, 17, 20, 0.07);
}

/* Thin horizontal rule above cover title */
[data-template="minimal"] .cover-hero::before {
  content: "";
  display: block;
  width: 28px;
  height: 2px;
  background: var(--deck-accent);
  margin-bottom: 20px;
}

/* Callout: left border only, no background */
[data-template="minimal"] .block-callout {
  border-radius: 0;
  padding-left: 24px;
  padding-right: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* Code blocks: square corners */
[data-template="minimal"] .block-code {
  border-radius: 8px;
}
```

- [ ] **Step 2: Create `preview/templates/bold.css`**

```css
[data-template="bold"] {
  --deck-card-bg: #111111;
  --deck-card-fg: #FFFFFF;
  --deck-accent: #FF3B30;
  --deck-muted: rgba(255, 255, 255, 0.5);
  --deck-subtle: rgba(255, 255, 255, 0.3);
  --deck-border: rgba(255, 255, 255, 0.08);
  --deck-shadow: 0 40px 120px rgba(0, 0, 0, 0.5);
  --deck-font-display: "Helvetica Neue", Arial, sans-serif;
  --deck-callout-bg: rgba(255, 59, 48, 0.12);
  --deck-callout-border: #FF3B30;
  --deck-code-bg: rgba(255, 255, 255, 0.06);
  --deck-code-border: rgba(255, 255, 255, 0.1);
  --deck-table-border: rgba(255, 255, 255, 0.12);
  --deck-table-header-bg: rgba(255, 255, 255, 0.06);
}

[data-template="bold"] .cover-title {
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: -0.05em;
}

[data-template="bold"] .cover-kicker,
[data-template="bold"] .section-kicker {
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.5;
}

/* Accent circle decoration, clipped by slide overflow:hidden */
[data-template="bold"] .slide-cover::before {
  content: "";
  position: absolute;
  top: -80px;
  right: -80px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: var(--deck-accent);
  opacity: 0.9;
  pointer-events: none;
  z-index: 0;
}

/* Full-width accent color bar footer */
[data-template="bold"] .slide-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 88px;
  background: var(--deck-accent);
  padding: 0 var(--deck-pad-x);
  display: flex;
  align-items: center;
  color: #ffffff;
  border-radius: 0 0 var(--deck-radius) var(--deck-radius);
}
```

- [ ] **Step 3: Create `preview/templates/technical.css`**

```css
[data-template="technical"] {
  --deck-card-bg: #0D1117;
  --deck-card-fg: #E6EDF3;
  --deck-accent: #58A6FF;
  --deck-muted: #7D8590;
  --deck-subtle: #484F58;
  --deck-border: #30363D;
  --deck-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  --deck-font-display: Menlo, Consolas, "Courier New", monospace;
  --deck-callout-bg: rgba(88, 166, 255, 0.08);
  --deck-callout-border: #58A6FF;
  --deck-code-bg: #161B22;
  --deck-code-border: #30363D;
  --deck-table-border: #30363D;
  --deck-table-header-bg: rgba(255, 255, 255, 0.04);
}

/* Dot grid background on every slide */
[data-template="technical"] .slide {
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.07) 1.5px,
    transparent 1.5px
  );
  background-size: 24px 24px;
}

/* ▸ prefix on kicker lines */
[data-template="technical"] .cover-kicker::before,
[data-template="technical"] .section-kicker::before {
  content: "▸ ";
  color: var(--deck-accent);
}

[data-template="technical"] .cover-kicker,
[data-template="technical"] .section-kicker {
  font-family: var(--deck-font-display);
  font-size: calc(var(--deck-small-size) * 0.85);
  letter-spacing: 0.06em;
}

/* Footer: counter left, green ● live dot right */
[data-template="technical"] .slide-footer {
  left: var(--deck-pad-x);
  right: var(--deck-pad-x);
  justify-content: space-between;
  font-family: var(--deck-font-display);
  font-size: calc(var(--deck-small-size) * 0.8);
}

[data-template="technical"] .slide-footer::after {
  content: "● live";
  color: #3FB950;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 4: Commit**

```bash
git add preview/templates/
git commit -m "feat: add minimal, bold, and technical CSS templates"
```

---

## Task 3: Template Loading in render-slide.mjs and preview.mjs

**Files:**
- Modify: `preview/render-slide.mjs:263-266`
- Modify: `preview/preview.mjs:99-123`

- [ ] **Step 1: Write the failing test for `data-template` attribute**

Create `test/html-template-smoke.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test test/html-template-smoke.test.mjs
```

Expected: FAIL — `assert.match` fails because `data-template` is not yet emitted.

- [ ] **Step 3: Update `renderPreviewDeck` in `preview/render-slide.mjs`**

Replace the existing `renderPreviewDeck` function (last export, currently lines 263–266):

```js
export async function renderPreviewDeck(content, options = {}) {
  const sourceDir = options.sourceDir ?? process.cwd();
  const theme = options.theme ?? content?.theme ?? null;
  const template = options.template ?? null;
  const templateAttr = template ? ` data-template="${escapeHtml(template)}"` : '';
  return `<main class="deck"${templateAttr} aria-label="poster-render HTML preview">${(await buildPreviewSlides(content, { sourceDir, theme })).join('')}</main>`;
}
```

- [ ] **Step 4: Add `TEMPLATE_SHIKI_THEMES` constant and update `buildPreviewDocument` in `preview/preview.mjs`**

Add the constant after the `PREVIEW_SEGMENT_PAD` declaration (after line 24):

```js
const TEMPLATE_SHIKI_THEMES = {
  minimal: 'github-light',
  bold: 'tokyo-night',
  technical: 'github-dark',
};
```

Replace the `buildPreviewDocument` function (currently lines 99–123):

```js
export async function buildPreviewDocument(content, { sourcePath = null, cssText = '', tokens = PREVIEW_TOKENS, template = null } = {}) {
  const resolvedTheme = resolveThemeConfig({
    TOKENS: tokens,
    SEGMENT_PAD: PREVIEW_SEGMENT_PAD,
    contentTheme: content?.theme ?? {},
    colorPalettes: COLOR_PALETTES,
  });

  if (template && TEMPLATE_SHIKI_THEMES[template]) {
    resolvedTheme.codeTheme = TEMPLATE_SHIKI_THEMES[template];
  }

  let templateCss = '';
  if (template) {
    const templatePath = path.resolve(MODULE_DIR, 'templates', `${template}.css`);
    if (fs.existsSync(templatePath)) {
      templateCss = fs.readFileSync(templatePath, 'utf8');
    }
  }

  const sourceDir = content?.sourceDir ?? (sourcePath ? path.dirname(sourcePath) : process.cwd());
  const deck = await renderPreviewDeck({ ...content, theme: resolvedTheme }, { sourceDir, template });
  const style = `${cssText}\n:root { ${themeToCssVars(resolvedTheme, tokens)} }\n${templateCss}`;
  const title = content?.cover?.title ? String(content.cover.title) : 'poster-render preview';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${style}</style>
  </head>
  <body>
    ${deck}
  </body>
</html>
`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test test/html-template-smoke.test.mjs
```

Expected: PASS — `data-template="technical"` now appears on the `.deck` element.

- [ ] **Step 6: Commit**

```bash
git add preview/render-slide.mjs preview/preview.mjs test/html-template-smoke.test.mjs
git commit -m "feat: wire template option through render-slide and preview document builder"
```

---

## Task 4: `--template` Flag in export-png.mjs

**Files:**
- Modify: `preview/export-png.mjs`

- [ ] **Step 1: Write the failing test for template PNG smoke (all three templates)**

Append to `test/html-template-smoke.test.mjs`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportPreviewPng } from '../preview/export-png.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-template-smoke-'));
}

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  assert.equal(buf.readUInt32BE(12), 0x49484452);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const template of ['minimal', 'bold', 'technical']) {
  test(`${template} template: exportPreviewPng produces 3 slides at 1080×1350`, async () => {
    const tmp = makeTempDir();
    const outputDir = path.join(tmp, 'out');
    const files = await exportPreviewPng(SAMPLE, { sourcePath: path.join(tmp, 'c.json'), outputDir, cssText: '', template });
    assert.equal(files.length, 3);
    for (const file of files) {
      assert.ok(fs.existsSync(file), `${file} should exist`);
      assert.deepEqual(readPngDimensions(file), { width: 1080, height: 1350 });
    }
  });
}
```

- [ ] **Step 2: Run the failing tests**

```bash
node --test test/html-template-smoke.test.mjs
```

Expected: The 3 new template smoke tests FAIL — `exportPreviewPng` doesn't forward `template` yet so the `data-template` attribute is missing and template CSS isn't loaded (but the PNGs still render, so the tests actually pass for size... Actually the tests will pass because the PNG dimensions are always 1080x1350 regardless. Let me reconsider.

The smoke tests verify dimensions, not visual identity. They'll likely pass even without Task 4 because `exportPreviewPng` already calls `buildPreviewDocument`. The real behavior change from Task 4 is that template CSS is applied. The attribute test in Step 1 already covers this.

Run tests to establish baseline:

```bash
node --test test/html-template-smoke.test.mjs
```

Expected: attribute test PASS, smoke tests PASS (dimensions correct regardless of CSS). This is fine — the template CSS is verified visually in Step 4 below.

- [ ] **Step 3: Update `exportPreviewPng` to accept and forward `template`**

In `preview/export-png.mjs`, replace the `exportPreviewPng` function signature and the `buildPreviewDocument` call:

```js
export async function exportPreviewPng(content, { sourcePath = null, outputDir = 'preview-export', cssText = '', template = null } = {}) {
  const resolvedCssText = cssText || fs.readFileSync(path.resolve(MODULE_DIR, 'preview.css'), 'utf8');
  const html = await buildPreviewDocument(content, { sourcePath, cssText: resolvedCssText, template });
  // ... rest of function unchanged ...
```

- [ ] **Step 4: Add `--template` to `parseArgs` and pass it through `main()`**

Replace `parseArgs` in `preview/export-png.mjs`:

```js
function parseArgs(argv) {
  const args = { input: null, output: 'preview-export', help: false, template: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '--output') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--output requires a directory path');
      args.output = next;
    } else if (arg === '--template') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--template requires a template name');
      args.template = next;
    } else if (!arg.startsWith('-') && !args.input) {
      args.input = arg;
    } else if (!arg.startsWith('-')) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}
```

In `main()`, update the `exportPreviewPng` call to pass `template`:

```js
const files = await exportPreviewPng(content, { sourcePath: resolvedInput, outputDir, cssText, template: args.template });
```

- [ ] **Step 5: Visual smoke check — render one template from CLI**

```bash
node preview/export-png.mjs examples/sample-content.json --template bold --output /tmp/bold-check
```

Expected: 4 PNG files in `/tmp/bold-check/`. Open `slide-01.png` — should show black background, red accent circle top-right, red footer bar.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
node --test test/*.mjs
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add preview/export-png.mjs test/html-template-smoke.test.mjs
git commit -m "feat: add --template flag to export-png.mjs"
```

---

## Task 5: `--template`, `--json`, `.md` Auto-Detection in render.js

**Files:**
- Modify: `render.js`

- [ ] **Step 1: Add `fileURLToPath` to the url import and compute `RENDER_DIR`**

In `render.js`, change line 5:

```js
import { pathToFileURL, fileURLToPath } from "url";
```

After the last `import` statement (currently around line 43), add:

```js
const RENDER_DIR = path.dirname(fileURLToPath(import.meta.url));
```

- [ ] **Step 2: Add `parseMarkdown` import**

Add this import after the existing imports block:

```js
import { parseMarkdown } from "./markdown-to-content.js";
```

- [ ] **Step 3: Add `--template` and `--json` to `parseArgs`**

Inside `parseArgs`, add `cliTemplate` and `cliJson` variables after the existing declarations:

```js
let cliTemplate = null;
let cliJson = false;
```

Inside the `for` loop, add these cases before the `if (arg.startsWith("--"))` unknown-option check:

```js
if (arg === "--template") {
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${arg}`);
  }
  cliTemplate = value;
  i++;
  continue;
}
if (arg === "--json") {
  cliJson = true;
  continue;
}
```

Update the return statement to include the new fields:

```js
return { inputFile, cliSpacing, cliPalette, cliType, cliOutput, cliNoCoverKicker, cliEasterEgg, cliSeed, cliTemplate, cliJson };
```

- [ ] **Step 4: Update `printUsage` to mention `--template`**

Replace the `printUsage` function body:

```js
const printUsage = () => {
  console.error("Usage: node render.js <content.json|deck.md> [--template minimal|bold|technical] [--spacing sm|md|lg] [--type sm|md|lg|golden-ratio] [--palette light|dark|warm|slate|paper|teal|midnight|clay] [--output <dir>] [--json] [--easteregg] [--seed <value>] [--no-cover-kicker] [--help]");
};
```

- [ ] **Step 5: Add HTML path routing in `main()` after arg destructuring**

In `main()`, after `const { inputFile, cliSpacing, ... } = parsed;` and before the existing `if (cliSpacing !== null && ...)` validation block, add:

```js
if (cliTemplate !== null) {
  const VALID_TEMPLATES = ["minimal", "bold", "technical"];
  if (!VALID_TEMPLATES.includes(cliTemplate)) {
    console.error(`Invalid --template "${cliTemplate}". Use one of: ${VALID_TEMPLATES.join(", ")}.`);
    process.exit(2);
  }

  const resolvedInput = path.resolve(inputFile);
  let content;
  if (inputFile.endsWith(".md")) {
    const markdown = fs.readFileSync(resolvedInput, "utf8");
    content = parseMarkdown(markdown, resolvedInput);
  } else {
    content = JSON.parse(fs.readFileSync(resolvedInput, "utf8"));
  }
  if (!content.sourceDir) {
    content.sourceDir = path.dirname(resolvedInput);
  }

  const autoCoverKicker = estimateCoverKicker(content);
  const cover = content.cover || {};
  content.cover = {
    ...cover,
    kicker: (cliNoCoverKicker || cover.showKicker === false)
      ? null
      : (cover.kicker && String(cover.kicker).trim() ? cover.kicker : autoCoverKicker),
  };

  const { exportPreviewPng } = await import("./preview/export-png.mjs");
  const cssText = fs.readFileSync(path.resolve(RENDER_DIR, "preview", "preview.css"), "utf8");
  const outDir = path.resolve(cliOutput);

  let files;
  try {
    files = await exportPreviewPng(content, {
      sourcePath: resolvedInput,
      outputDir: outDir,
      cssText,
      template: cliTemplate,
    });
  } catch (err) {
    console.error(err);
    process.exit(3);
  }

  if (cliJson) {
    process.stdout.write(
      JSON.stringify({ slides: files, count: files.length, template: cliTemplate, output: outDir }) + "\n"
    );
  } else {
    console.error(`Rendered ${files.length} slides → ${outDir}`);
  }
  return;
}
```

- [ ] **Step 6: Write the failing .md auto-detection test**

Append to `test/html-template-smoke.test.mjs`:

```js
import { parseMarkdown } from '../markdown-to-content.js';

test('.md auto-detection: parseMarkdown produces valid content for buildPreviewDocument', async () => {
  const tmp = makeTempDir();
  const mdPath = path.join(tmp, 'deck.md');
  const md = `# My Deck\n\nSubtitle here\n\n## Section One\n\nBody text.\n`;
  fs.writeFileSync(mdPath, md);

  const content = parseMarkdown(md, mdPath);
  assert.equal(typeof content.cover, 'object');
  assert.equal(content.cover.title, 'My Deck');
  assert.ok(Array.isArray(content.sections));
  assert.ok(content.sections.length >= 1);

  const html = await buildPreviewDocument(content, { cssText: '', template: 'minimal' });
  assert.match(html, /data-template="minimal"/);
  assert.match(html, /My Deck/);
});
```

- [ ] **Step 7: Run the new test**

```bash
node --test test/html-template-smoke.test.mjs
```

Expected: All tests PASS including the `.md` test.

- [ ] **Step 8: Manual end-to-end check of all three templates via render.js**

```bash
node render.js examples/sample-content.json --template minimal --output /tmp/out-minimal
node render.js examples/sample-content.json --template bold --output /tmp/out-bold
node render.js examples/sample-content.json --template technical --output /tmp/out-technical
```

Each should print `Rendered N slides → /tmp/out-<template>`. Open one PNG per template and verify the visual identity matches the spec (cream/serif for minimal, black+red for bold, midnight+dots for technical).

- [ ] **Step 9: Manual check of `--json` flag**

```bash
node render.js examples/sample-content.json --template bold --json --output /tmp/out-json
```

Expected stdout (only, no other output on stdout):
```json
{"slides":["/tmp/out-json/slide-01.png",...],"count":4,"template":"bold","output":"/tmp/out-json"}
```

- [ ] **Step 10: Manual check of `.md` input**

```bash
node render.js examples/sample-markdown.md --template technical --output /tmp/out-md
```

Expected: renders without error, produces PNGs in `/tmp/out-md/`.

- [ ] **Step 11: Confirm canvas path still works (backward compat)**

```bash
node render.js examples/sample-content.json --palette dark --output /tmp/out-canvas
```

Expected: renders using the canvas path unchanged.

- [ ] **Step 12: Run full test suite**

```bash
node --test test/*.mjs
```

Expected: All tests pass.

- [ ] **Step 13: Commit**

```bash
git add render.js test/html-template-smoke.test.mjs
git commit -m "feat: add --template, --json flags and .md auto-detection to render.js"
```

---

## Task 6: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add template flag documentation to the Options table**

In `README.md`, find the `**Options:**` table and add a row for `--template`:

```markdown
| `--template <name>` | `minimal` \| `bold` \| `technical` | Use HTML+Playwright render path with named visual template |
| `--json` | flag | Write `{"slides":[…],"count":N,"template":"…"}` to stdout (agent-friendly) |
```

- [ ] **Step 2: Add a new "Templates" section after the Markdown adapter section**

```markdown
## Templates

Three named visual identities are available via the `--template` flag. All produce 1080×1350px PNGs via Playwright.

```sh
node render.js content.json --template minimal
node render.js content.json --template bold
node render.js content.json --template technical

# Markdown input is accepted directly — no adapter step needed
node render.js deck.md --template bold

# Machine-readable output for AI agent pipelines
node render.js deck.md --template bold --json
```

| Template | Feel | Background | Accent |
|----------|------|------------|--------|
| `minimal` | Thought leadership, personal brand | `#FAF9F6` cream | Black rule |
| `bold` | Campaign, viral XHS content | `#111111` black | `#FF3B30` red |
| `technical` | Engineering blog, devtools | `#0D1117` midnight | `#58A6FF` blue |

Each template is a CSS file under `preview/templates/`. To add a fourth template, create `preview/templates/<name>.css` and add the name to the `VALID_TEMPLATES` array in `render.js`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document --template flag and three visual templates"
```

---

## Self-Review Checklist (run before handing off)

- [ ] Spec requirement: HTML+Playwright primary path → Task 5 routes `--template` through `exportPreviewPng` ✓
- [ ] Spec requirement: minimal/bold/technical templates → Tasks 1–2 ✓
- [ ] Spec requirement: `--json` flag → Task 5 Step 5 ✓
- [ ] Spec requirement: `.md` auto-detection → Task 5 Steps 5–7 ✓
- [ ] Spec requirement: canvas path unchanged → Task 5 Step 11 ✓
- [ ] Spec requirement: Shiki theme per template → Task 3 Step 4 (`TEMPLATE_SHIKI_THEMES`) ✓
- [ ] Spec requirement: `--deck-font-display` token → Task 1 ✓
- [ ] Spec requirement: exit codes 0/1/2/3 → Task 5 Step 5 (`process.exit(2)` on bad template, `process.exit(3)` on render error) ✓
- [ ] Type consistency: `exportPreviewPng(content, { ..., template })` — defined in Task 4 Step 3, used in Task 5 Step 5 ✓
- [ ] Type consistency: `buildPreviewDocument(content, { ..., template })` — defined in Task 3 Step 4, used throughout ✓
- [ ] Type consistency: `renderPreviewDeck(content, { ..., template })` — defined in Task 3 Step 3, called in Task 3 Step 4 ✓
