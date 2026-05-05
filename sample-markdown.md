# Agent-first poster workflow
A tiny Markdown adapter lets agents iterate fast and render through the existing CLI.

> Markdown is the universal handoff format for agent loops.
> Keep the renderer focused on JSON → PNG.

## Why this is useful
- easy to edit in Claude Code, OpenClaw, Hermes, or any other agent loop
- works well with git diff / review
- keeps content source decoupled from rendering

1. draft in Markdown
2. convert to `content.json`
3. render PNG
4. inspect and iterate

- [x] headings
- [x] paragraphs
- [x] lists
- [x] blockquotes
- [x] code fences
- [x] tables

```js
const mode = "markdown";
console.log(`rendering via ${mode}`);
```

| block | support |
| --- | --- |
| quotes | callout |
| lists | list |
| code | code card |

---

### Small caveat
This adapter is intentionally minimal: it focuses on common block-level Markdown, not full AST fidelity.
