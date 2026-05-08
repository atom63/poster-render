import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHighlighter } from 'shiki';
import { normalizeShikiLang, resolveShikiThemeName } from '../shiki-utils.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isAbsoluteUrl(value) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

export function resolvePreviewSrc(src, sourceDir = process.cwd()) {
  if (!src) return '';
  const value = String(src);
  if (value.startsWith('data:') || value.startsWith('blob:') || isAbsoluteUrl(value)) {
    return value;
  }
  const absolutePath = path.resolve(sourceDir, value);
  return pathToFileURL(absolutePath).href;
}

function inlineMarkdown(text) {
  const withLinks = escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  return withLinks;
}

function renderTextParagraphs(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n\s*\n/g)
    .map((paragraph) => `<p>${paragraph.split('\n').map((line) => inlineMarkdown(line)).join('<br />')}</p>`)
    .join('');
}

function renderTaskListItem(item) {
  const checked = item.checked ? ' checked' : '';
  return `<li><input type="checkbox" disabled${checked} aria-label="${item.checked ? 'checked' : 'unchecked'}" /><span>${inlineMarkdown(item.content)}</span></li>`;
}

function renderListFromLines(content) {
  const lines = String(content ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) return '';

  const first = lines[0];
  const taskLike = /^[-*+]\s+\[[ xX]\]\s+/.test(first);
  const orderedLike = /^\d+\.\s+/.test(first);
  const parsed = lines.map((line) => {
    const task = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      return { kind: 'task', checked: /x/i.test(task[1]), content: task[2] };
    }
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      return { kind: 'ordered', content: ordered[1] };
    }
    const bullet = line.match(/^(?:[-*+•])\s+(.*)$/);
    if (bullet) {
      return { kind: 'bullet', content: bullet[1] };
    }
    return { kind: 'bullet', content: line };
  });

  if (taskLike) {
    return `<ul class="block-list block-list--task">${parsed.map(renderTaskListItem).join('')}</ul>`;
  }

  if (orderedLike) {
    return `<ol class="block-list block-list--ordered">${parsed.map((item) => `<li>${inlineMarkdown(item.content)}</li>`).join('')}</ol>`;
  }

  return `<ul class="block-list block-list--unordered">${parsed.map((item) => `<li>${inlineMarkdown(item.content)}</li>`).join('')}</ul>`;
}

export function renderTextBlock(text, className = 'block block-text') {
  return `<section class="${className}">${renderTextParagraphs(text)}</section>`;
}

export function renderCalloutBlock(text) {
  return `<section class="block block-callout">${renderTextParagraphs(text)}</section>`;
}

export function renderTableBlock(block) {
  const header = Array.isArray(block?.header) ? block.header : [];
  const rows = Array.isArray(block?.rows) ? block.rows : [];
  const alignments = Array.isArray(block?.alignments) ? block.alignments : [];
  const cells = (row, tag) => row
    .map((value, index) => {
      const align = alignments[index] ? `text-align:${alignments[index]};` : '';
      return `<${tag}${tag === 'td' ? ` style="${align}"` : ''}>${inlineMarkdown(value ?? '')}</${tag}>`;
    })
    .join('');

  return `
    <section class="block block-table-wrap">
      <table class="block block-table">
        <thead><tr>${cells(header, 'th')}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody>
      </table>
    </section>
  `.trim();
}

const _shikiCache = new Map();

async function getShikiHighlighter(themeName) {
  if (!_shikiCache.has(themeName)) {
    _shikiCache.set(themeName, createHighlighter({
      themes: [themeName],
      langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'c', 'cpp', 'html', 'css', 'json', 'jsonc', 'bash', 'yaml', 'markdown', 'sql', 'text'],
    }).catch((error) => {
      _shikiCache.delete(themeName);
      throw error;
    }));
  }
  return _shikiCache.get(themeName);
}

function renderPlainCode(code) {
  return escapeHtml(String(code ?? ''));
}

function renderShikiTokenLines(tokens) {
  return tokens.map((line) => line.map((token) => {
    const content = escapeHtml(token.content);
    const color = token.color ? ` style="color: ${escapeHtml(token.color)}"` : '';
    return `<span${color}>${content}</span>`;
  }).join('')).join('\n');
}

async function renderHighlightedCode(code, lang, paletteName, theme) {
  const shikiTheme = resolveShikiThemeName(paletteName, theme?.codeTheme);
  try {
    const highlighter = await getShikiHighlighter(shikiTheme);
    const safeLang = normalizeShikiLang(lang);
    const loadedLangs = highlighter.getLoadedLanguages();
    const renderedLang = loadedLangs.includes(safeLang) ? safeLang : 'text';
    const { tokens } = highlighter.codeToTokens(String(code ?? ''), { lang: renderedLang, theme: shikiTheme });
    return renderShikiTokenLines(tokens);
  } catch {
    return renderPlainCode(code);
  }
}

export function renderImageBlock({ src, alt = '', sourceDir = process.cwd() }) {
  const resolved = resolvePreviewSrc(src, sourceDir);
  const caption = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '';
  return `<figure class="block block-image"><img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" />${caption}</figure>`;
}

export async function renderCodeBlock(block, options = {}) {
  const language = block?.lang ? String(block.lang).trim() : 'text';
  const languageClass = language && language !== 'text' ? ` language-${escapeHtml(language)}` : '';
  const highlighted = await renderHighlightedCode(block?.content ?? '', language, options.theme?.palette, options.theme);
  return `<section class="block block-code"><div class="block-label">${escapeHtml(language)}</div><pre><code class="${languageClass.trim()}">${highlighted}</code></pre></section>`;
}

export async function renderBlock(block, options = {}) {
  if (!block) return '';
  if (typeof block === 'string') return renderTextBlock(block);
  switch (block.type) {
    case 'text':
      return renderTextBlock(block.content ?? '');
    case 'callout':
      return renderCalloutBlock(block.content ?? '');
    case 'list':
      return `<section class="block block-list-wrap">${renderListFromLines(block.content ?? '')}</section>`;
    case 'code':
      return renderCodeBlock(block, options);
    case 'table':
      return renderTableBlock(block);
    case 'image':
      return renderImageBlock({ src: block.src, alt: block.alt ?? '', sourceDir: options.sourceDir });
    default:
      return renderTextBlock(block.content ?? '');
  }
}

export async function renderBodyBlocks(body, options = {}) {
  if (body == null) return '';
  if (typeof body === 'string') {
    return renderTextBlock(body);
  }
  if (!Array.isArray(body)) {
    return renderBlock(body, options);
  }
  return (await Promise.all(body.map((block) => renderBlock(block, options)))).join('');
}
