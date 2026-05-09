# poster-render

Node.js CLI for rendering Xiaohongshu (XHS) carousel poster slides as PNG images.
It accepts structured JSON and outputs 1080×1350px slides.
Typography, syntax highlighting, background patterns, and cover image support are included.

Open source and MIT licensed, with a small surface area designed to be easy to extend. Issues and PRs are welcome.

## Install

```sh
pnpm install
```

When published globally, the package exposes:

- `poster-render` → render slides from a content JSON file

If you want an adapter layer, keep the adapter input in Markdown.
Markdown is the most portable handoff format for AI agents, editors, and
other content pipelines.

## Quick start

1. Start from `examples/sample-content.json` or create your own `content.json`:

```sh
cp examples/sample-content.json content.json
```

2. Render it:

```sh
pnpm render
# or
npx poster-render content.json
```

3. Find your slides in `./output/slide-01.png`, `slide-02.png`, …

### Sample content

```json
{
  "template": "default",
  "theme": { "palette": "dark", "fontFamily": "sans" },
  "cover": {
    "title": "My First Poster",
    "subtitle": "Made with poster-render"
  },
  "sections": [
    {
      "headline": "Why this tool?",
      "body": "Writing carousel content by hand is tedious.\n\nThis tool takes structured JSON and renders polished slides automatically."
    },
    {
      "headline": "Code blocks work too",
      "body": "Syntax highlighting out of the box:\n\n```js\nconst msg = 'hello world';\nconsole.log(msg);\n```"
    }
  ],
  "cta": "Try it yourself"
}
```

### Markdown render demos

These three slides come from the Markdown adapter output, so they show what
survives conversion: headings, lists, blockquotes, code fences, and tables.

| Variant | Preview |
| --- | --- |
| EN / technical / midnight | <img src="docs/assets/reference/markdown/en-technical-midnight.png" width="520" alt="markdown render demo en technical midnight" /> |
| CN / slate / line-grid | <img src="docs/assets/reference/markdown/cn-slate-linegrid.png" width="520" alt="markdown render demo cn slate line-grid" /> |
| EN / dark / dither | <img src="docs/assets/reference/markdown/en-dark-dither.png" width="520" alt="markdown render demo en dark dither" /> |


## Prerequisites

- **Node.js 18+** (ESM, top-level `await`, and built-in `fetch` are used)
- **node-canvas native dependencies** — the `canvas` package builds against Cairo/Pango:
  - macOS: `brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman`
  - Ubuntu/Debian: `sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
  - Other platforms: see [node-canvas wiki](https://github.com/Automattic/node-canvas/wiki)

## Setup

```sh
pnpm install
```

### Helpful scripts

```sh
pnpm help     # show CLI usage
pnpm sample   # render examples/sample-content.json into ./output-sample
pnpm preview  # generate ./preview.html from the sample deck
pnpm preview:export  # optional HTML -> PNG export from the preview path
pnpm lint     # basic syntax check for the CLI files
```

### Render paths

`render.js` keeps the current canvas pipeline as the production default. That is
still the command you should use for normal exports:

```sh
pnpm render
# or
node render.js content.json --output ./output
```

The browser HTML path is opt-in and lives under `preview/` for review and
experimentation:

```sh
node preview/preview.mjs examples/sample-content.json --output ./preview.html
```

If you want PNGs from the preview, use the explicit export step:

```sh
node preview/export-png.mjs examples/sample-content.json --output ./preview-export
```

The preview path renders the same slide order as the content JSON and uses semantic
blocks for cover, section, callout, list, code, table, and image content.
It is not the default renderer yet; only promote HTML export after parity is
proven on representative decks.

### Custom fonts (optional)

Place `.ttf` or `.otf` files in `./fonts/`.
`render.js` auto-registers matching files by name substring, so the file name only needs to include one of these markers:

| Font file name contains | Family used |
|-------------------------|-------------|
| `geistmono` | `mono` |
| `geist` | `sans` |
| `helvetica` | `sans` / `Helvetica Neue` |
| `georgia` | `serif` / `Georgia` |
| `menlo` | `mono` / `Menlo` |

Without font files, system fallbacks are used. For Western text, the defaults are Helvetica/Georgia/Menlo.
For Chinese/CJK text, install a CJK-capable font on the machine.
Examples: PingFang SC, Hiragino Sans GB, Microsoft YaHei, or Noto Sans CJK SC.

Emoji are rendered through Twemoji PNGs when possible, but offline or blocked network access can still fall back to simple ASCII symbols.

## Usage

```sh
pnpm render                          # renders content.json → ./output/
node render.js <content.json> \
  [--help] [--spacing sm|md|lg] [--palette light|dark|warm|slate|paper|teal|midnight|clay] \
  [--output <dir>] [--easteregg] [--seed <value>] # explicit file + options
```

If installed globally or via `npx`, use:

```sh
poster-render content.json --output ./output
poster-render --help
```

Outputs `slide-01.png`, `slide-02.png`, … to `./output/` (or a custom directory).

Sections are **auto-paginated**: if a section body is too tall for a slide, it is split across multiple slides automatically.
Sections with images are treated as page-break boundaries.
They usually start a new slide when they would otherwise follow earlier content.

**Options:**

| Flag | Values | Description |
|------|--------|-------------|
| `--output <dir>` | any path | Output directory (default: `./output`) |
| `--palette <name>` | see palettes | Override palette from CLI |
| `--spacing <size>` | `sm` \| `md` \| `lg` | Override spacing from CLI |
| `--typography <name>` | `sm` \| `md` \| `lg` \| `golden-ratio` | Override global typography scale from CLI |
| `--type <name>` | same as `--typography` | Backward-compatible alias |
| `--easteregg` | flag | Enable seeded background remix mode |
| `--seed <value>` | any string | Seed for the easteregg remix |
| `--template <name>` | `minimal` \| `bold` \| `technical` | Use HTML+Playwright render path with named template |
| `--json` | flag | Write structured JSON result to stdout (`{"slides":[…],"count":N,"template":"…","output":"…"}`) |

## Templates

Templates are CSS-only visual identities for the HTML render path (`--template` flag). Each template sets a distinct background, accent color, and typographic feel without touching the content structure.

| Template | Feel | Background | Accent |
|----------|------|------------|--------|
| `minimal` | Thought leadership, editorial | `#FAF9F6` cream | `#111111` black |
| `bold` | Campaign, product launches | `#111111` dark | `#FF3B30` red |
| `technical` | Engineering blog, devtools | `#0D1117` midnight | `#58A6FF` blue |

```sh
# Human use
poster-render content.json --template minimal --output ./slides

# Agent pipeline (Markdown input, JSON output)
poster-render deck.md --template bold --json
```

**Example:**

```sh
node render.js content.json --palette dark --output ./out-dark
```

## Markdown adapter for agents

Use Markdown for iteration, then convert to `content.json` before rendering.

```sh
node src/markdown-to-content.js examples/sample-markdown.md --output content.json
# or
pnpm markdown:content -- examples/sample-markdown.md --output content.json
pnpm render
```

This keeps `poster-render` focused on rendering JSON to PNG. Markdown stays the adapter layer; other sources can remain separate and optional.

## content.json schema

```jsonc
{
  "template": "default",             // optional; defaults to "default" (legacy alias: boardStyle)
  "theme": { /* see Theme options */ },
  "cover": {
    "title": "Slide title",
    "subtitle": "Optional subtitle",
    "kicker": "Optional top line; auto-generated by default",
    "showKicker": true,                  // set false to hide the top line
    "coverImage": "path/to/image.jpg",  // optional
    "coverStyle": "card"                 // "card" | "fluid" | "inset" (default: template default)
  },
  "sections": [
    {
      "headline": "Section heading",
      "body": "Body text.\n\nSupports multiple paragraphs.",
      "image": "path/to/image.jpg",      // optional inline image
      "imageAspect": "16/9",             // "16/9" | "4/3" | "1/1" | "free"
      "imagePosition": "top"             // "top" | "center" | "bottom"
    }
  ],
  "cta": "Closing call-to-action text",
  "tags": "#hashtag1 #hashtag2"          // shown on CTA slide
}
```

The top-level `template` field selects the layout family and defaults to `default`. `boardStyle` is accepted as a backward-compatible alias.

The cover kicker is generated by default from the deck text as `全文 {字数}字 · {阅读时间}分钟阅读`.
Turn it off with `cover.showKicker: false` in JSON or `--no-cover-kicker` on the CLI.

### Theme options

Theme knobs: `palette`, `fontFamily`, `spacing`, `typography`, `pattern`, `coverStyle`, color overrides, code sizing, and markdown theme tokens.
- `palette` — overall color system
- `fontFamily` — sans / serif / mono
- `spacing` — compact / default / roomy layout
- `typography` — global text scale preset (`sm` / `md` / `lg` / `golden-ratio`)
- `pattern` — optional background texture
- `coverStyle` — cover image treatment
- color overrides — fine-tune individual colors when you need a custom look
- code block sizing — `codeFontSize`, `codeLineHeight`, and padding values
- markdown theming tokens — border/grid/callout/header/card/code theme controls

| Token | What it controls | Default |
| --- | --- | --- |
| `borderAlpha` | table / card outer border strength | `0.15` |
| `gridAlpha` | table grid line strength | `0.12` |
| `calloutAccentAlpha` | callout left accent bar | `0.6` |
| `headerTintAlpha` | table header tint | `0.05` |
| `cardBorderAlpha` | card outer border | `0.1` |
| `cardTintFallback` | fallback tint when `cardBg` is absent | `0.18` |
| `codeTheme` | Shiki theme name for code blocks | palette-derived |

```jsonc
{
  "theme": {
    "palette": "light",
    "fontFamily": "sans",
    "typography": "md",
    "spacing": "md"
  }
}
```

The easteregg remix mode is opt-in: set `"easterEgg": { "mode": "random-patterns", "seed": "..." }` in JSON.
Or pass `--easteregg --seed <value>` on the CLI.
CLI flags take precedence for enablement/seed, and the remix stays reproducible for the same seed plus the same deck/template identity.
It now selects from a curated presentation recipe set (palette + spacing + pattern).
It may layer a second subtle texture, while still staying visually safe.
If remix composition fails, rendering falls back to the normal theme.

### Visual references

Each section below uses one standalone full-slide preview per item so the differences stay readable in GitHub’s table layout.

#### Background palettes

Ordered for scannability: default neutral → soft light variants → cool light → dark variants → earthy special.

| Palette | Preview |
| --- | --- |
| light | <img src="docs/assets/reference/palettes/light.png" width="520" alt="palette light" /> |
| paper | <img src="docs/assets/reference/palettes/paper.png" width="520" alt="palette paper" /> |
| warm | <img src="docs/assets/reference/palettes/warm.png" width="520" alt="palette warm" /> |
| teal | <img src="docs/assets/reference/palettes/teal.png" width="520" alt="palette teal" /> |
| dark | <img src="docs/assets/reference/palettes/dark.png" width="520" alt="palette dark" /> |
| slate | <img src="docs/assets/reference/palettes/slate.png" width="520" alt="palette slate" /> |
| midnight | <img src="docs/assets/reference/palettes/midnight.png" width="520" alt="palette midnight" /> |
| clay | <img src="docs/assets/reference/palettes/clay.png" width="520" alt="palette clay" /> |

Quick compare: <img src="docs/assets/reference/palettes/preset-contact-sheet.png" width="520" alt="palette preset contact sheet" />

#### Background patterns

| Pattern | Preview |
| --- | --- |
| none | <img src="docs/assets/reference/patterns/none.png" width="520" alt="pattern none" /> |
| dot-grid | <img src="docs/assets/reference/patterns/dot-grid.png" width="520" alt="pattern dot-grid" /> |
| line-grid | <img src="docs/assets/reference/patterns/line-grid.png" width="520" alt="pattern line-grid" /> |
| diagonal | <img src="docs/assets/reference/patterns/diagonal.png" width="520" alt="pattern diagonal" /> |
| halftone | <img src="docs/assets/reference/patterns/halftone.png" width="520" alt="pattern halftone" /> |
| dither | <img src="docs/assets/reference/patterns/dither.png" width="520" alt="pattern dither" /> |
| ascii | <img src="docs/assets/reference/patterns/ascii.png" width="520" alt="pattern ascii" /> |
| paper | <img src="docs/assets/reference/patterns/paper.png" width="520" alt="pattern paper" /> |

#### Font families

| Font | Preview |
| --- | --- |
| sans | <img src="docs/assets/reference/fonts/sans.png" width="520" alt="font sans" /> |
| serif | <img src="docs/assets/reference/fonts/serif.png" width="520" alt="font serif" /> |
| mono | <img src="docs/assets/reference/fonts/mono.png" width="520" alt="font mono" /> |

#### Spacing presets

| Spacing | Preview |
| --- | --- |
| sm | <img src="docs/assets/reference/spacing/sm.png" width="520" alt="spacing sm" /> |
| md | <img src="docs/assets/reference/spacing/md.png" width="520" alt="spacing md" /> |
| lg | <img src="docs/assets/reference/spacing/lg.png" width="520" alt="spacing lg" /> |

### Palettes

| Name | Background | Style |
|------|-----------|-------|
| `light` | `#FAFAF8` | Clean white |
| `dark` | `#09090B` | Deep black |
| `warm` | `#FEFCE8` | Yellow warm |
| `slate` | `#0F172A` | Indigo dark |
| `paper` | `#FDF6ED` | Parchment |
| `teal` | `#E8F5F3` | Soft teal |
| `midnight` | `#1A1A1A` | Warm dark |
| `clay` | `#F6EEE9` | Clay rose |

### Cover styles

| Style | Description |
|-------|-------------|
| `card` | Image in a rounded card, sits above title text |
| `fluid` | Image fills full bleed with title overlaid |
| `inset` | Image displayed as an inset panel alongside text |

### Section body syntax

Body text supports inline code with backticks and fenced code blocks:

````
"body": "Install with `npm install`.\n\n```js\nconsole.log('hello');\n```"
````

Supported languages for syntax highlighting: `js`, `ts`, `python`, `rust`, `go`, `java`, `c`, `cpp`, `html`, `css`, `json`, `bash`, `sql`.

## Slide structure

1. **Cover** — title, subtitle, optional cover image
2. **Content slides** — auto-paginated from sections; each section with an image gets its own slide
3. **CTA** — closing slide with call-to-action and tags

## Release status

This repository is already solid for local use and open-source development.
It includes package metadata, installable bin entries, a license, a sample input file, and basic verification scripts.
It also has node:test coverage for table pagination, wrapped code rendering, and tarball install + render smoke checks.
It is publishable as-is; the remaining work is mainly release automation if you want regular npm publishes.

## Contributing

Small patches are preferred.
Run `pnpm test` and `pnpm lint` before sending a PR.
Keep `README.md` aligned with the actual CLI behavior and sample assets.

## Credit

Built by You Zhang through Hermes Agent

## License

MIT — see [LICENSE](LICENSE).
