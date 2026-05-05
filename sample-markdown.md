# Agent-first poster workflow
A tiny Markdown adapter lets agents iterate fast and render through the existing CLI.

## Why this is useful
Markdown is easy to edit in Claude Code, OpenClaw, Hermes, or any other agent loop.

It maps cleanly to poster content without making Notion the main path.

## Code example
```js
const mode = "markdown";
console.log(`rendering via ${mode}`);
```

---

### Small caveat
This adapter is intentionally minimal: it focuses on headings, paragraphs, horizontal rules, and fenced code blocks.
