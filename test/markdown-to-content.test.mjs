import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../markdown-to-content.js';

test('parses common markdown blocks into poster content', () => {
  const md = `---
title: ignored
---
# Title
Subtitle paragraph.

> Quote line one
> Quote line two

- item one
- item two

1. first
2. second

- [x] done
- [ ] todo

![alt](./foo.png)

| A | B |
| --- | --- |
| 1 | 2 |

---

## Section
Body text.
`;

  const content = parseMarkdown(md, '/tmp/sample.md');

  assert.equal(content.cover.title, 'Title');
  assert.equal(content.cover.subtitle, 'Subtitle paragraph.');
  assert.equal(content.sections.length, 2);

  const first = content.sections[0];
  assert.equal(first.image, './foo.png');
  assert.deepEqual(first.body.map((seg) => seg.type), ['callout', 'list', 'list', 'list', 'code']);
  assert.match(first.body[0].content, /Quote line one/);
  assert.match(first.body[1].content, /• item one/);
  assert.match(first.body[2].content, /1\. first/);
  assert.match(first.body[3].content, /☑ done/);
  assert.match(first.body[4].content, /\| A \| B \|/);

  const second = content.sections[1];
  assert.equal(second.headline, 'Section');
  assert.equal(second.body[0].content, 'Body text.');
});
