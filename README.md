# poster-render

Node.js CLI tool that renders XHS (Xiaohongshu) carousel poster slides as PNG images.

## Setup

```sh
npm install
```

### Fonts (optional)

Place `.ttf` or `.otf` font files in `./fonts/` to use custom fonts:

- **Inter** → `sans` family
- **Instrumental Serif** → `serif` family
- **Geist Mono** → `mono` family

Files are matched by name (e.g. `Inter-Bold.ttf`, `InstrumentalSerif-Regular.otf`). Without bundled fonts, system fallbacks are used.

## Usage

```sh
node render.js content.json
```

Outputs `slide-01.png`, `slide-02.png`, etc. to `./output/`.

## content.json format

```json
{
  "theme": {
    "background": "#FAFAF8",
    "foreground": "#1A1A1A",
    "mutedForeground": "#888888",
    "accent": "#3B82F6",
    "fontFamily": "sans"
  },
  "cover": {
    "title": "Your Title",
    "subtitle": "Optional subtitle"
  },
  "sections": [
    {
      "headline": "Section heading",
      "body": "Body text that auto-paginates across slides."
    }
  ],
  "cta": "Call to action text"
}
```

### Theme options

- `fontFamily`: `"sans"`, `"serif"`, or `"mono"`
- Colors: any hex value for `background`, `foreground`, `mutedForeground`, `accent`

## Slide structure

1. **Cover** — title, subtitle, accent bar
2. **Content slides** — auto-paginated from sections, with headlines and body text
3. **CTA** — closing slide with accent styling
