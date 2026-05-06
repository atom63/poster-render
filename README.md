# poster-render

Node.js CLI that renders Xiaohongshu (XHS) carousel poster slides as PNG images. It takes structured JSON and outputs 1080×1350px slides with typography, syntax highlighting, background patterns, and cover image support.

## Install

```sh
npm install
```

For global use after publishing, the package exposes:

- `poster-render` → render slides from a content JSON file

If you want to add an adapter layer, keep the adapter input in Markdown.
Markdown is the most universal handoff format for AI agents, editors, and
other content pipelines.

## Quick start

1. Start from `examples/sample-content.json` or create your own `content.json`:

```sh
cp examples/sample-content.json content.json
```

2. Render it:

```sh
npm run render
# or
npx poster-render content.json
```

3. Find your slides in `./output/slide-01.png`, `slide-02.png`, …

### Sample content

```json
{
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

## Prerequisites

- **Node.js 18+** (ESM, top-level `await`, and built-in `fetch` are used)
- **node-canvas native dependencies** — the `canvas` package builds against Cairo/Pango:
  - macOS: `brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman`
  - Ubuntu/Debian: `sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
  - Other platforms: see [node-canvas wiki](https://github.com/Automattic/node-canvas/wiki)

## Setup

```sh
npm install
```

### Helpful scripts

```sh
npm run help    # show CLI usage
npm run sample  # render examples/sample-content.json into ./output-sample
npm run lint    # basic syntax check for the CLI files
```

### Custom fonts (optional)

Place `.ttf` or `.otf` files in `./fonts/`. `render.js` auto-registers matching files by name substring, so the file name only needs to include one of these markers:

| Font file name contains | Family used |
|-------------------------|-------------|
| `geistmono` | `mono` |
| `geist` | `sans` |
| `helvetica` | `sans` / `Helvetica Neue` |
| `georgia` | `serif` / `Georgia` |
| `menlo` | `mono` / `Menlo` |

Without font files, system fallbacks are used. For Western text, the defaults are Helvetica/Georgia/Menlo; for Chinese/CJK text, install a CJK-capable font on the machine (for example PingFang SC, Hiragino Sans GB, Microsoft YaHei, or Noto Sans CJK SC) to reduce tofu/spacing issues.

Emoji are rendered through Twemoji PNGs when possible, but offline or blocked network access can still fall back to simple ASCII symbols.

## Usage

```sh
npm run render                          # renders content.json → ./output/
node render.js <content.json> [--help] [--spacing sm|md|lg] [--palette light|dark|warm|slate|paper|teal|midnight|clay] [--output <dir>] # explicit file + options
```

If installed globally or via `npx`, use:

```sh
poster-render content.json --output ./output
poster-render --help
```

Outputs `slide-01.png`, `slide-02.png`, … to `./output/` (or a custom directory).

Sections are **auto-paginated**: if a section's body text is too tall to fit the slide, it is split across multiple slides automatically. Sections with images always get their own slide.

**Options:**

| Flag | Values | Description |
|------|--------|-------------|
| `--output <dir>` | any path | Output directory (default: `./output`) |
| `--palette <name>` | see palettes | Override palette from CLI |
| `--spacing <size>` | `sm` \| `md` \| `lg` | Override spacing from CLI |

**Example:**

```sh
node render.js content.json --palette dark --output ./out-dark
```

## Markdown adapter for agents

Use Markdown as the *working* format for agent iteration, then convert it to
`content.json` with the adapter script before rendering.

```sh
node markdown-to-content.js examples/sample-markdown.md --output content.json
# or
npm run markdown:content -- examples/sample-markdown.md --output content.json
npm run render
```

Mapping rules are intentionally simple:

- `#` → cover title
- first paragraph after `#` → cover subtitle
- `##` / `###` → section headlines
- normal paragraphs → body text
- `>` blockquotes → callout cards
- `-`, `*`, `1.` lists → list cards
- `- [ ]` / `- [x]` task lists → task-list text in list cards
- fenced code blocks → code cards with safe wrapping for long tokens
- pipe tables → aligned table cards rendered as real tables
- standalone `![img](path)` → section image
- `---` → optional section break
- YAML frontmatter → ignored

Tables render as real table cards, and tall tables are paginated across slides with the header repeated on continuation pages. Code blocks wrap long tokens and expressions safely at the character level, so long identifiers stay inside the code card instead of overflowing.

Example loop for OpenClaw / Hermes / Claude-style workflows:

1. edit `*.md`
2. run `node markdown-to-content.js <input.md> --output content.json`
3. run `npm run render`
4. inspect the PNG output and iterate

This keeps `poster-render` focused on rendering JSON to PNG. Markdown is the
universal adapter layer; other sources can stay separate and optional.

## content.json schema

```jsonc
{
  "theme": { /* see Theme options */ },
  "cover": {
    "title": "Slide title",
    "subtitle": "Optional subtitle",
    "coverImage": "path/to/image.jpg",  // optional
    "coverStyle": "card"                 // "card" | "fluid" | "inset" (default: "card")
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

### Theme options

You can tune the look in `theme` with these knobs:
- `palette` — overall color system
- `fontFamily` — sans / serif / mono
- `spacing` — compact / default / roomy layout
- `pattern` — optional background texture
- `coverStyle` — cover image treatment
- color overrides — fine-tune individual colors when you need a custom look
- code block sizing — `codeFontSize`, `codeLineHeight`, and padding values

```jsonc
{
  "theme": {
    // Palette (sets all colors; override individual keys below)
    "palette": "light",        // "light" | "dark" | "warm" | "slate" | "paper" | "teal" | "midnight" | "clay"

    // Typography
    "fontFamily": "sans",      // "sans" | "serif" | "mono"

    // Spacing
    "spacing": "md",           // "sm" | "md" | "lg"

    // Color overrides (any hex, overrides palette)
    "background": "#FAFAF8",
    "foreground": "#09090B",
    "mutedForeground": "#71717A",
    "subtleForeground": "#A1A1AA",
    "accent": "#09090B",

    // Background pattern
    "pattern": "none",         // "none" | "dot-grid" | "line-grid" | "diagonal" | "halftone" | "dither" | "ascii" | "paper"
    "patternOpacity": 0.08,
    "patternColor": "#000000",
    "patternSpacing": 48,
    "patternVary": true,       // randomize ascii chars
    "patternChars": "01 ·∙",   // custom char set for "ascii" pattern
    "patternFontSize": 18,
    "patternBlend": "source-over",  // CSS blend mode
    "patternMask": "none",     // "none" | "top" | "bottom" | "left" | "right" | "radial" | "center-v" | "center-h" | "noise"

    // Code block styling
    "codeFontSize": 30,
    "codeLineHeight": 48,
    "codePadTop": 24,
    "codePadBottom": 24,
    "codePadLeft": 32,
    "codePadRight": 32
  }
}
```

### Visual references

Each section below uses one standalone preview per item so the differences stay readable in GitHub’s table layout.

#### Background palettes

| Palette | Preview |
| --- | --- |
| light | <img src="docs/assets/reference/palettes/light.png" width="260" alt="palette light" /> |
| dark | <img src="docs/assets/reference/palettes/dark.png" width="260" alt="palette dark" /> |
| warm | <img src="docs/assets/reference/palettes/warm.png" width="260" alt="palette warm" /> |
| slate | <img src="docs/assets/reference/palettes/slate.png" width="260" alt="palette slate" /> |
| paper | <img src="docs/assets/reference/palettes/paper.png" width="260" alt="palette paper" /> |
| teal | <img src="docs/assets/reference/palettes/teal.png" width="260" alt="palette teal" /> |
| midnight | <img src="docs/assets/reference/palettes/midnight.png" width="260" alt="palette midnight" /> |
| clay | <img src="docs/assets/reference/palettes/clay.png" width="260" alt="palette clay" /> |

#### Background patterns

| Pattern | Preview |
| --- | --- |
| none | <img src="docs/assets/reference/patterns/none.png" width="260" alt="pattern none" /> |
| dot-grid | <img src="docs/assets/reference/patterns/dot-grid.png" width="260" alt="pattern dot-grid" /> |
| line-grid | <img src="docs/assets/reference/patterns/line-grid.png" width="260" alt="pattern line-grid" /> |
| diagonal | <img src="docs/assets/reference/patterns/diagonal.png" width="260" alt="pattern diagonal" /> |
| halftone | <img src="docs/assets/reference/patterns/halftone.png" width="260" alt="pattern halftone" /> |
| dither | <img src="docs/assets/reference/patterns/dither.png" width="260" alt="pattern dither" /> |
| ascii | <img src="docs/assets/reference/patterns/ascii.png" width="260" alt="pattern ascii" /> |
| paper | <img src="docs/assets/reference/patterns/paper.png" width="260" alt="pattern paper" /> |

#### Font families

| Font | Preview |
| --- | --- |
| sans | <img src="docs/assets/reference/fonts/sans.png" width="260" alt="font sans" /> |
| serif | <img src="docs/assets/reference/fonts/serif.png" width="260" alt="font serif" /> |
| mono | <img src="docs/assets/reference/fonts/mono.png" width="260" alt="font mono" /> |

#### Spacing presets

| Spacing | Preview |
| --- | --- |
| sm | <img src="docs/assets/reference/spacing/sm.png" width="260" alt="spacing sm" /> |
| md | <img src="docs/assets/reference/spacing/md.png" width="260" alt="spacing md" /> |
| lg | <img src="docs/assets/reference/spacing/lg.png" width="260" alt="spacing lg" /> |

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

This repository is in good shape for local and open-source use: it has package metadata, installable bin entries, a license, a sample input file, basic verification scripts, and node:test coverage for table pagination and wrapped code rendering. A polished release would mainly need CI/release automation and a published npm version.
