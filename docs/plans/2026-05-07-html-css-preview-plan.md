# HTML/CSS Preview for poster-render Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add an HTML/CSS preview path for `poster-render` so YZ can inspect decks in a browser with better live control, while keeping `content.json` canonical and preserving the current canvas renderer as the production baseline.

**Architecture:** Keep the existing JSON → PNG pipeline intact. Add a sibling HTML preview layer that renders the same normalized content model into a fixed-size slide canvas in the browser, using CSS variables for theme tokens and semantic block markup for cover / sections / code / tables / images. If PNG export from HTML is needed, add an explicit screenshot/export step on top of the preview layer rather than replacing the current renderer immediately.

**Tech Stack:** Node.js ESM, existing `render.js` / `markdown-to-content.js`, browser HTML/CSS, optional headless browser export (Puppeteer or Playwright if export-from-HTML is pursued), node test runner.

---

## Task 1: Define the preview contract and file layout

**Objective:** Add a minimal, explicit HTML preview entry point and shared theme-to-CSS token bridge without changing current rendering behavior.

**Files:**
- Create: `preview/index.html`
- Create: `preview/preview.css`
- Create: `preview/preview.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Step 1: Write failing test**

Create `test/html-preview-contract.test.mjs` to assert that the preview module can:
- load a `content.json`
- emit a deck-shaped HTML document
- expose the same slide count / titles / section ordering as the JSON input

Run:
```bash
node --test test/html-preview-contract.test.mjs
```
Expected: FAIL because `preview/preview.mjs` does not exist yet.

**Step 2: Implement minimal scaffold**

Implement the preview module so it:
- accepts `content.json` as input
- maps theme values to CSS custom properties
- writes a single HTML document with one root slide container per slide
- keeps the layout fixed at the current poster size (1080×1350)

**Step 3: Run test to verify pass**

Run:
```bash
node --test test/html-preview-contract.test.mjs
```
Expected: PASS.

**Step 4: Update package scripts**

Add scripts such as:
- `npm run preview` → generate HTML preview output
- `npm run preview:open` → generate and open locally if desired

**Step 5: Commit**

```bash
git add preview package.json README.md test/html-preview-contract.test.mjs
git commit -m "feat: add HTML preview scaffold"
```

---

## Task 2: Render core slide types in HTML/CSS

**Objective:** Recreate the current deck structure in semantic HTML/CSS for cover, section, callout, list, code, table, and image blocks.

**Files:**
- Create: `preview/render-slide.mjs`
- Create: `preview/render-blocks.mjs`
- Modify: `preview/preview.css`
- Modify: `preview/preview.mjs`
- Modify: `markdown-to-content.js` only if preview metadata is needed

**Step 1: Write failing test**

Create `test/html-preview-rendering.test.mjs` to assert that:
- headings map to cover/section roles correctly
- lists / task lists render as readable HTML lists
- code blocks preserve line breaks and language classes
- tables render with header/body separation
- images retain alt text and source resolution

Run:
```bash
node --test test/html-preview-rendering.test.mjs
```
Expected: FAIL initially.

**Step 2: Implement minimal rendering**

Render the following HTML structure:
- `article.slide`
- `header.cover`
- `section.block.block-text`
- `section.block.block-code`
- `section.block.block-table`
- `figure.block.block-image`

Use CSS variables for:
- palette
- typography scale
- spacing
- border radius
- shadow / paper background

**Step 3: Verify with a sample deck**

Run:
```bash
node markdown-to-content.js examples/sample-markdown.md --output /tmp/sample-content.json
node preview/preview.mjs /tmp/sample-content.json --output /tmp/sample-preview.html
```
Open the HTML and verify:
- slide bounds are stable
- wrapping is readable
- code/table blocks don’t collapse
- page counters remain visible

**Step 4: Run tests again**

```bash
node --test test/html-preview-rendering.test.mjs
npm test --silent
```
Expected: PASS.

**Step 5: Commit**

```bash
git add preview test
git commit -m "feat: render poster slides in HTML/CSS"
```

---

## Task 3: Add optional PNG export from the HTML preview

**Objective:** If we want HTML/CSS to become the actual render path for some decks, add a screenshot/export step that produces PNGs from the browser-rendered slides.

**Files:**
- Create: `preview/export-png.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Possibly add browser dependency config if needed (`puppeteer` or `playwright`)

**Step 1: Write failing test**

Create `test/html-preview-export.test.mjs` that verifies:
- the export command generates one PNG per slide
- output dimensions match 1080×1350
- generated files are non-empty

Run:
```bash
node --test test/html-preview-export.test.mjs
```
Expected: FAIL because export does not exist yet.

**Step 2: Implement minimal export path**

Use a headless browser to:
- open the HTML preview
- wait for fonts and images
- screenshot each slide region to PNG

Keep the current canvas renderer untouched as fallback / reference.

**Step 3: Verify with a real deck**

Run:
```bash
node preview/export-png.mjs /tmp/sample-content.json --output /tmp/sample-html-export
```
Check:
- correct slide count
- files are written
- image edges are clean
- no clipped text

**Step 4: Add regression compare against current renderer**

Render the same sample deck with both paths and compare:
- slide count
- visible crop safety
- rough layout parity on text-only pages

**Step 5: Commit**

```bash
git add preview package.json README.md test/html-preview-export.test.mjs
git commit -m "feat: export HTML preview to PNG"
```

---

## Task 4: Add parity tests, docs, and rollout guardrails

**Objective:** Keep the new HTML path useful without letting it silently drift from the current renderer.

**Files:**
- Modify: `test/*.mjs`
- Modify: `README.md`
- Modify: `package.json`
- Possibly modify: `render.js` if adding a `--preview` flag

**Step 1: Write parity test**

Add a test that renders a small representative deck through both paths and checks:
- same slide count
- same section ordering
- same page titles/captions
- no missing images/tables/code blocks

Run:
```bash
npm test --silent
```
Expected: PASS only after both paths are working.

**Step 2: Add docs**

Document three workflows clearly:
- current canvas export
- HTML browser preview
- optional HTML → PNG export

**Step 3: Add rollout guardrail**

Make the HTML path opt-in first.
Suggested default:
- `render.js` keeps current canvas export behavior
- `preview/` is for review and experimentation
- only promote HTML export to default after parity is proven on representative decks

**Step 4: Final verification**

Run:
```bash
npm run lint
npm test --silent
node render.js examples/sample-content.json --output /tmp/canvas-smoke
node preview/preview.mjs examples/sample-content.json --output /tmp/preview-smoke.html
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add HTML preview workflow and guardrails"
```

---

## Suggested execution order

1. Preview scaffold
2. Core HTML slide rendering
3. Optional PNG export
4. Parity tests + docs

## Stop condition

Stop after the preview path is working and visually reviewable. If PNG export from HTML is unstable, keep it optional and leave the current canvas renderer as the reliable production path.
