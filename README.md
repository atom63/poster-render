# poster-render

Node.js CLI that renders Xiaohongshu (XHS) carousel poster slides as PNG images. Takes a structured `content.json` and outputs 1080×1350px slides with typography, syntax highlighting, background patterns, and cover image support.

## Quick start

1. Create a `content.json`:

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

2. Run:

```sh
npm run render
# or: node render.js content.json
```

3. Find your slides in `./output/slide-01.png`, `slide-02.png`, …

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

### Custom fonts (optional)

Place `.ttf` or `.otf` files in `./fonts/`. Files are matched by name substring:

| Font file name contains | Family used |
|-------------------------|-------------|
| `Inter` | `sans` |
| `InstrumentalSerif` | `serif` |
| `GeistMono` | `mono` |

Without font files, system fallbacks are used. For Western text, the defaults are Helvetica/Georgia/Menlo; for Chinese/CJK text, install a CJK-capable font on the machine (for example PingFang SC, Hiragino Sans GB, Microsoft YaHei, or Noto Sans CJK SC) to reduce tofu/spacing issues.

Emoji are rendered through Twemoji PNGs when possible, but offline or blocked network access can still fall back to simple ASCII symbols.

## Usage

```sh
npm run render                          # renders content.json → ./output/
node render.js <content.json> [--help] [--spacing sm|md|lg] [--palette light|dark|warm|slate|paper|teal|midnight] [--output <dir>] # explicit file + options
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

## Notion integration

Pull a Notion page directly into `content.json` format:

```sh
# Requires NOTION_KEY env var (or set in ~/.openclaw/openclaw.json)
node notion-to-content.js <page-id> [--output content.json] [--theme '{"palette":"slate"}']
```

Notion block mapping:
- `heading_1` → cover title (first one) or new section headline
- `paragraph` after cover heading → cover subtitle
- `paragraph` / `bulleted_list` / `numbered_list` → body text
- `image` → downloaded to `./screenshots/`, inserted as `section.image`
- `divider` → forces a new section

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

```jsonc
{
  "theme": {
    // Palette (sets all colors; override individual keys below)
    "palette": "light",        // "light" | "dark" | "warm" | "slate" | "paper" | "teal" | "midnight"

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
