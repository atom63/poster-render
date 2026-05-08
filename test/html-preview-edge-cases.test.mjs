import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { buildPreviewDocument } from '../preview/preview.mjs';

const LONG_TEXT = 'This paragraph is intentionally long. '.repeat(18);
const CSS_TEXT = fs.readFileSync(new URL('../preview/preview.css', import.meta.url), 'utf8');

const DENSE_CONTENT = {
  cover: {
    title: 'Edge case deck',
    subtitle: 'Long copy stress test',
    kicker: 'QA',
  },
  sections: [
    {
      headline: 'A long section headline that should wrap cleanly and stay readable even when the copy gets much denser than the sample deck',
      body: [
        { type: 'text', content: `${LONG_TEXT}\n\n${LONG_TEXT}` },
        { type: 'callout', content: LONG_TEXT },
        { type: 'list', content: `- ${LONG_TEXT}\n- ${LONG_TEXT}\n- ${LONG_TEXT}` },
      ],
    },
  ],
  cta: 'Finish line',
};

test('dense preview slides do not clip long copy', async () => {
  const html = await buildPreviewDocument(DENSE_CONTENT, { cssText: CSS_TEXT });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 2200 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await (document.fonts?.ready ?? Promise.resolve());
    });

    const slides = page.locator('.slide');
    const count = await slides.count();
    assert.equal(count, 8);

    const slideMetrics = [];
    for (let index = 0; index < count; index++) {
      slideMetrics.push(await slides.nth(index).evaluate((el) => {
        const slideRect = el.getBoundingClientRect();
        const footer = el.querySelector('.slide-footer');
        const blocks = [...el.querySelectorAll('.block')];
        const lastBlock = blocks.at(-1);
        const lastBlockRect = lastBlock?.getBoundingClientRect() ?? null;
        const footerRect = footer?.getBoundingClientRect() ?? null;
        return {
          className: el.className,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          slideBottom: slideRect.bottom,
          lastBlockBottom: lastBlockRect?.bottom ?? null,
          footerTop: footerRect?.top ?? null,
          title: el.getAttribute('data-slide-title'),
        };
      }));
    }

    for (const meta of slideMetrics) {
      if (!meta.className.includes('slide-section')) continue;
      assert.equal(meta.scrollHeight <= meta.clientHeight, true, `slide overflows: ${meta.title} scrollHeight=${meta.scrollHeight}, clientHeight=${meta.clientHeight}`);
      assert.ok(meta.lastBlockBottom !== null, `expected a final content block for ${meta.title}`);
      assert.ok(meta.footerTop !== null, `expected a slide footer for ${meta.title}`);
      assert.ok(meta.lastBlockBottom <= meta.footerTop - 24, `last block is too close to footer: ${meta.title} lastBlockBottom=${meta.lastBlockBottom}, footerTop=${meta.footerTop}`);
    }

    const denseMeta = slideMetrics.find((entry) => entry.title === 'A long section headline that should wrap cleanly and stay readable even when the copy gets much denser than the sample deck');
    assert.ok(denseMeta, 'expected dense section slide to be present');
    assert.match(denseMeta.className, /slide--dense/);
    assert.equal(denseMeta.title, 'A long section headline that should wrap cleanly and stay readable even when the copy gets much denser than the sample deck');
  } finally {
    await browser.close();
  }
});
