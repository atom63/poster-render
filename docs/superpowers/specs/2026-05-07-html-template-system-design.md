# HTML Template System Design

**Date:** 2026-05-07
**Status:** Approved

## Goal

Promote the HTML+Playwright render path to primary. Replace the single visual language with three distinct CSS-only templates (Minimal, Bold, Technical) that eliminate the "generic" feeling. Make the tool a better first-class citizen in AI agent pipelines.

## Background

The current tool has two render paths:
- **Canvas** (`render.js`) — primary, uses node-canvas, produces PNGs directly
- **HTML+Playwright** (`preview/export-png.mjs`) — experimental, uses Chromium screenshot

The canvas path produces correct output but is hard to iterate on visually — every design change requires modifying imperative drawing code. The HTML path renders the same semantic blocks via CSS, making design changes fast and maintainable.

The single visual language (one CSS file, palette swaps only) produces slides that feel generic regardless of palette. The fix is distinct template identities, not better tokens.

## Architecture

### Primary Render Pipeline

```
content.json / deck.md
  → render.js --template <name>
    → markdown-to-content.js (if .md input)
    → preview/render-slide.mjs (HTML generation)
    → preview/preview.mjs (inject template CSS + base CSS)
    → preview/export-png.mjs (Playwright screenshot each .slide)
    → slide-01.png, slide-02.png, …
```

### Legacy Canvas Path

Unchanged. All existing flags (`--palette`, `--spacing`, `--typography`, `--easteregg`, etc.) continue to work. No removals.

### Template Loading

Each template is a single CSS file. The HTML document gets a `data-template` attribute on the root `.deck` element:

```html
<main class="deck" data-template="bold">…</main>
```

`preview.mjs` injects `base.css` (structural rules) + the selected `template.css` (identity overrides) into the document `<head>`. No JavaScript changes needed.

## File Changes

### New files

```
preview/templates/minimal.css
preview/templates/bold.css
preview/templates/technical.css
```

### Modified files

| File | Change |
|------|--------|
| `preview/preview.css` | Structural CSS retained; remaining hardcoded color/font values extracted to CSS custom properties (including new `--deck-font-display`). Not renamed — `export-png.mjs` references it directly. |
| `preview/preview.mjs` | Accepts `template` option; injects base + template CSS; adds `data-template` on deck element. |
| `preview/export-png.mjs` | Adds `--template` flag; passes template name to `preview.mjs`. |
| `render.js` | Adds `--template` flag; when present, routes to HTML+Playwright path instead of canvas. Adds `--json` flag. Adds `.md` auto-detection. |

## Template Specifications

### Common structure

All templates share:
- Slide dimensions: 1080 × 1350px
- Base padding: `--deck-pad-x`, `--deck-pad-y` (overridable per template)
- Same HTML block types: cover, section, cta, text, callout, list, code, table, image
- Shiki syntax highlighting — each template pins a specific Shiki theme (see below)
- Slide counter in footer

A new `--deck-font-display` CSS custom property is added to `preview.css` (defaults to `--deck-font-sans`). Templates that want a distinct display/title font override only `--deck-font-display`; body text uses `--deck-font-sans`.

**Shiki theme per template:**

| Template | Shiki theme |
|----------|-------------|
| minimal | `github-light` |
| bold | `tokyo-night` |
| technical | `github-dark` |

### Minimal

**Feel:** Thought leadership, personal brand, premium editorial

| Token | Value |
|-------|-------|
| `--deck-card-bg` | `#FAF9F6` |
| `--deck-card-fg` | `#111111` |
| `--deck-accent` | `#111111` |
| `--deck-muted` | `#888888` |
| `--deck-font-display` | `Georgia, Times New Roman, serif` |
| `--deck-font-sans` | `Helvetica Neue, Helvetica, Arial, sans-serif` |
| Cover | 24px left rule accent, generous top margin, wide whitespace |
| Footer | Mono counter, bottom-left, no background |
| Code blocks | Square corners (`border-radius: 8px`), minimal border |
| Callout | Left border only, no background tint |
| Title tracking | `-0.04em` |

### Bold

**Feel:** Campaign, viral content, product launches, XHS lifestyle

| Token | Value |
|-------|-------|
| `--deck-card-bg` | `#111111` |
| `--deck-card-fg` | `#FFFFFF` |
| `--deck-accent` | `#FF3B30` |
| `--deck-muted` | `rgba(255,255,255,0.5)` |
| `--deck-font-sans` | `Helvetica Neue, Arial, sans-serif` |
| Cover | Accent circle shape (CSS `::before`), `UPPERCASE` title, full-width accent color footer strip |
| Footer | Full-width accent-colored bar at slide bottom, slide counter inside it |
| Code blocks | High-contrast dark card inside dark slide |
| Callout | Accent-color left border, strong tint |
| Title weight | `900`, `text-transform: uppercase`, tracking `-0.05em` |

### Technical

**Feel:** Engineering blog, devtools product, technical tutorial

| Token | Value |
|-------|-------|
| `--deck-card-bg` | `#0D1117` |
| `--deck-card-fg` | `#E6EDF3` |
| `--deck-accent` | `#58A6FF` |
| `--deck-accent-green` | `#3FB950` |
| `--deck-muted` | `#7D8590` |
| `--deck-font-sans` | `Helvetica Neue, Helvetica, Arial, sans-serif` |
| `--deck-font-mono` | `Menlo, Consolas, monospace` |
| Cover | Dot-grid CSS background pattern, terminal chrome bar (window dots), section kicker in mono |
| Footer | Mono counter left + green `● live` dot right |
| Code blocks | GitHub-style dark card (`#161B22`), `#30363D` border |
| Callout | Blue accent border, dark tint |
| Section kicker | Rendered in monospace, `▸` prefix |

## CLI Interface

### New flags

| Flag | Values | Description |
|------|--------|-------------|
| `--template <name>` | `minimal` \| `bold` \| `technical` | Select HTML template; routes to HTML+Playwright path |
| `--json` | flag | Write structured result to stdout: `{"slides":[…],"count":N,"template":"…"}` |

### Auto-detection

If the input file has a `.md` extension, `render.js` automatically pipes it through `markdown-to-content.js` before rendering. No temp file written — the content object is passed in-memory.

### Example commands

```sh
# Agent pipeline — Markdown input, JSON output
poster-render deck.md --template bold --json

# Human use — explicit JSON, named template
poster-render content.json --template minimal --output ./slides

# Legacy canvas — unchanged
poster-render content.json --palette dark --output ./slides
```

## Agent Integration

### Input formats accepted

- `content.json` — canonical, full schema
- `deck.md` — auto-converted via markdown adapter; subset of JSON schema features

### Output (--json mode)

```json
{
  "slides": ["output/slide-01.png", "output/slide-02.png"],
  "count": 6,
  "template": "bold",
  "output": "./output"
}
```

Written to stdout. All other log output (progress, warnings) goes to stderr so it doesn't interfere with JSON parsing.

### Exit codes

- `0` — success
- `1` — input file not found or parse error
- `2` — invalid flag value
- `3` — render error (Playwright failure, font error, etc.)

## What Does Not Change

- `content.json` schema — no breaking changes
- Canvas render path — all existing flags preserved
- `markdown-to-content.js` — unchanged, just invoked automatically for `.md` inputs
- Shiki syntax highlighting — same in HTML path, theme derived from template
- Test suite — existing tests unaffected; new tests added for template rendering

## Testing

- One render smoke test per template (cover + one section + CTA → correct PNG count)
- `--json` flag output is valid JSON with correct shape
- `.md` auto-detection produces same output as explicit adapter + render
- Playwright screenshot dimensions are exactly 1080 × 1350px per slide
- Backward compat: `--palette dark` on canvas path still produces output (existing test)
