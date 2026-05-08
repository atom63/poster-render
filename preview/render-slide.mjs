import path from 'node:path';
import { escapeHtml, renderBodyBlocks, renderImageBlock, renderTextBlock } from './render-blocks.mjs';

function slideFooter(index, total) {
  return `<footer class="slide-footer" aria-label="slide ${index} of ${total}"><span class="slide-counter">${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></footer>`;
}

function coverParts(cover = {}) {
  return {
    kicker: cover.kicker ?? '',
    title: cover.title ?? '',
    subtitle: cover.subtitle ?? '',
    coverImage: cover.coverImage ?? '',
    showKicker: cover.showKicker !== false,
  };
}

function sectionHeading(section = {}, index) {
  return section.headline ?? `Section ${index}`;
}

function slideAttrs(kind, title, index, dense = false) {
  return [
    `class="slide slide-${kind}${dense ? ' slide--dense' : ''}"`,
    `data-slide-kind="${escapeHtml(kind)}"`,
    `data-slide-index="${index}"`,
    `data-slide-title="${escapeHtml(title)}"`,
  ].join(' ');
}

function collectTextLength(value) {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + collectTextLength(item), 0);
  if (typeof value === 'object') {
    let total = 0;
    for (const key of ['content', 'headline', 'title', 'subtitle', 'alt', 'kicker', 'cta']) {
      if (typeof value[key] === 'string') total += value[key].length;
    }
    if (Array.isArray(value.body)) total += collectTextLength(value.body);
    if (Array.isArray(value.rows)) total += collectTextLength(value.rows);
    if (Array.isArray(value.header)) total += collectTextLength(value.header);
    return total;
  }
  return 0;
}

function isDenseSection(section = {}) {
  const bodyBlocks = Array.isArray(section.body) ? section.body.length : section.body ? 1 : 0;
  const textLength = collectTextLength(section) + collectTextLength(section.body);
  return bodyBlocks >= 3 || textLength >= 1400;
}

function splitLongText(text, maxChars = 900) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = [];
  const paragraphs = normalized.split(/\n\s*\n/g);

  const splitSegment = (segment) => {
    const words = segment.split(/(\s+)/);
    let current = '';
    for (const token of words) {
      if (!token) continue;
      if (!current && token.length > maxChars) {
        for (let i = 0; i < token.length; i += maxChars) {
          chunks.push(token.slice(i, i + maxChars).trim());
        }
        continue;
      }
      if ((current + token).length > maxChars && current.trim()) {
        chunks.push(current.trim());
        current = token.trimStart();
      } else {
        current += token;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  };

  let current = '';
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    if (paragraph.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      splitSegment(paragraph);
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current.trim()) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitLinesBlock(content, maxLines = 6, maxChars = 900) {
  const lines = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const line of lines) {
    const nextChars = currentChars + line.length;
    if (current.length > 0 && (current.length >= maxLines || nextChars > maxChars)) {
      chunks.push(current.join('\n'));
      current = [];
      currentChars = 0;
    }
    current.push(line);
    currentChars += line.length;
  }
  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
}

function splitBlockForPreview(block) {
  if (!block) return [];
  if (typeof block === 'string') return [{ type: 'text', content: block }];

  switch (block.type) {
    case 'text': {
      return splitLongText(block.content ?? '', 1100).map((content) => ({ type: 'text', content }));
    }
    case 'callout': {
      return splitLongText(block.content ?? '', 850).map((content) => ({ type: 'callout', content }));
    }
    case 'list': {
      return splitLinesBlock(block.content ?? '', 6, 900).map((content) => ({ type: 'list', content }));
    }
    case 'code': {
      return splitLinesBlock(block.content ?? '', 12, 1200).map((content) => ({
        type: 'code',
        lang: block.lang,
        content,
      }));
    }
    default:
      return [block];
  }
}

function splitSectionForPreview(section = {}) {
  const body = Array.isArray(section.body) ? section.body : section.body ? [section.body] : [];
  const dense = isDenseSection(section);
  // Dense sections should split earlier so the first page doesn't sit on the bottom edge.
  const maxChars = dense ? 1300 : 2400;
  const slides = [];
  let current = { ...section, body: [] };
  let currentChars = collectTextLength(section.headline ?? '') + collectTextLength(section.imageAlt ?? '');

  const pushCurrent = () => {
    if (current.body.length > 0 || current.image || current.headline || current.body === '') {
      slides.push(current);
    }
  };

  for (const block of body) {
    const pieces = splitBlockForPreview(block);
    for (const piece of pieces) {
      const pieceChars = collectTextLength(piece);
      if (current.body.length > 0 && currentChars + pieceChars > maxChars) {
        pushCurrent();
        current = { ...section, body: [], continued: true };
        currentChars = collectTextLength(section.headline ?? '') + collectTextLength(section.imageAlt ?? '');
      }
      current.body.push(piece);
      currentChars += pieceChars;
    }
  }

  pushCurrent();
  return slides.length > 0 ? slides : [{ ...section, body: [] }];
}

function renderCoverSlide(content, sourceDir, index, total) {
  const cover = coverParts(content.cover);
  const image = cover.coverImage ? renderImageBlock({ src: cover.coverImage, alt: cover.title, sourceDir }) : '';
  return `
    <article ${slideAttrs('cover', cover.title || 'Cover', index)}>
      <header class="cover">
        <div class="cover-hero">
          ${cover.showKicker && cover.kicker ? `<p class="cover-kicker">${escapeHtml(cover.kicker)}</p>` : ''}
          <h1 class="cover-title">${escapeHtml(cover.title || 'Untitled deck')}</h1>
          ${cover.subtitle ? `<p class="cover-subtitle">${escapeHtml(cover.subtitle)}</p>` : ''}
        </div>
        ${image ? `<div class="cover-image">${image}</div>` : ''}
      </header>
      ${slideFooter(index, total)}
    </article>
  `.trim();
}

async function renderSectionSlide(section, sourceDir, index, total, theme) {
  const title = sectionHeading(section, index);
  const isContinuation = Boolean(section.continued);
  const kicker = isContinuation ? `Section ${String(index - 1).padStart(2, '0')} · continued` : `Section ${String(index - 1).padStart(2, '0')}`;
  const image = section.image ? renderImageBlock({ src: section.image, alt: section.imageAlt ?? title, sourceDir }) : '';
  const body = await renderBodyBlocks(section.body, { sourceDir, theme });
  return `
    <article ${slideAttrs('section', title, index, isDenseSection(section))}>
      <header class="section-header">
        <p class="section-kicker">${escapeHtml(kicker)}</p>
        <h2 class="section-title">${escapeHtml(title)}</h2>
      </header>
      <div class="section-body">
        ${image}
        ${body}
      </div>
      ${slideFooter(index, total)}
    </article>
  `.trim();
}

function renderCtaSlide(content, sourceDir, index, total) {
  const cta = content.cta ?? '';
  const tags = content.tags ? `<p class="slide-meta">${escapeHtml(content.tags)}</p>` : '';
  return `
    <article ${slideAttrs('cta', cta || 'Call to action', index, collectTextLength(cta) >= 120)}>
      <div class="slide-cta">
        <header class="section-header">
          <p class="section-kicker">Closing slide</p>
          <h2 class="cta-title">${escapeHtml(cta || 'Thanks for reading')}</h2>
        </header>
        <div class="cta-body">
          ${tags}
        </div>
      </div>
      ${slideFooter(index, total)}
    </article>
  `.trim();
}

export async function buildPreviewSlides(content, { sourceDir = process.cwd(), theme = content?.theme ?? null } = {}) {
  const slides = [renderCoverSlide(content, sourceDir, 1, 1)];
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const hasCta = Boolean(String(content?.cta ?? '').trim());
  const expandedSections = sections.flatMap((section) => splitSectionForPreview(section));
  const total = 1 + expandedSections.length + (hasCta ? 1 : 0);
  slides[0] = renderCoverSlide(content, sourceDir, 1, total);
  const renderedSections = await Promise.all(expandedSections.map((section, offset) => renderSectionSlide(section, sourceDir, offset + 2, total, theme)));
  slides.push(...renderedSections);
  if (hasCta) {
    slides.push(renderCtaSlide(content, sourceDir, total, total));
  }
  return slides;
}

export async function renderPreviewDeck(content, options = {}) {
  const sourceDir = options.sourceDir ?? process.cwd();
  const theme = options.theme ?? content?.theme ?? null;
  const template = options.template ?? null;
  const templateAttr = template ? ` data-template="${escapeHtml(template)}"` : '';
  return `<main class="deck"${templateAttr} aria-label="poster-render HTML preview">${(await buildPreviewSlides(content, { sourceDir, theme })).join('')}</main>`;
}
