export const SEGMENT_PAD = {
  callout: { top: 20, bottom: 20, left: 27, right: 16, borderWidth: 3 }, // left = border(3) + gap(24)
  code:    { top: 10, bottom: 4, left: 14, right: 14 },
  table:   { top: 14, bottom: 14, left: 16, right: 16, cellX: 12, cellY: 9, grid: 1 },
};

export const SEGMENT_GAP = 16;
export const SEGMENT_RADIUS = 12;

export function normalizeBody(body) {
  if (!body) return null;
  if (Array.isArray(body)) return body;
  // Legacy string format → single text segment
  return [{ type: "text", content: body }];
}

export function measureSectionHeight(
  section,
  headlineFont,
  bodyFont,
  headlineLineHeight,
  bodyLineHeight,
  layout,
  options = {},
  imageH = 0,
  deps = {},
) {
  const {
    TOKENS,
    antiWidowWidth,
    measureTextHeight,
    measureCodeHeight,
    measureTableSegmentHeight,
    isEmoji,
    resolveThemeNumber,
  } = deps;

  const codePadTop = resolveThemeNumber(options.codePadTop, SEGMENT_PAD.code.top);
  const codePadBottom = resolveThemeNumber(options.codePadBottom, SEGMENT_PAD.code.bottom);
  const codePadLeft = resolveThemeNumber(options.codePadLeft, SEGMENT_PAD.code.left);
  const codePadRight = resolveThemeNumber(options.codePadRight, SEGMENT_PAD.code.right);
  const codeFontSize = resolveThemeNumber(options.codeFontSize, TOKENS.type.code.size);
  const codeLineHeight = resolveThemeNumber(options.codeLineHeight, TOKENS.type.code.lineHeight);

  let h = 0;
  // Image: full-width, plus gap below
  if (imageH > 0) {
    h += imageH + layout.headlineToBody;
  }
  if (section.headline) {
    const hw = antiWidowWidth(section.headline, headlineFont, layout.contentWidth);
    h += measureTextHeight(section.headline, headlineFont, hw, headlineLineHeight);
    h += layout.headlineToBody;
  }
  const segments = normalizeBody(section.body);
  if (segments) {
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (si > 0) h += SEGMENT_GAP;

      if (seg.type === "callout") {
        const pad = SEGMENT_PAD.callout;
        const emojiSize = Math.round(TOKENS.type.body.size * 1.2);
        const emojiGap = 8;
        const hasEmojiImg = seg.emoji && isEmoji(seg.emoji);
        const emojiOffset = hasEmojiImg ? emojiSize + emojiGap : 0;
        const innerW = layout.contentWidth - pad.left - pad.right - emojiOffset;
        // Reserve space for the fallback text path too, so missing Twemoji does not under-measure.
        const displayText = (seg.emoji ? (deps.EMOJI_ASCII_FALLBACK[seg.emoji] || seg.emoji) + " " : "") + seg.content;
        const textH = measureTextHeight(displayText, bodyFont, innerW, bodyLineHeight);
        const minH = hasEmojiImg ? Math.max(textH, emojiSize) : textH;
        h += pad.top + minH + pad.bottom;
      } else if (seg.type === "code") {
        const innerW = layout.contentWidth - codePadLeft - codePadRight;
        const textH = measureCodeHeight(deps.measureCtx, seg.content, codeFontSize, codeLineHeight, innerW);
        h += codePadTop + textH + codePadBottom;
      } else if (seg.type === "table") {
        const tableH = measureTableSegmentHeight(deps.measureCtx, seg, bodyFont, bodyLineHeight, layout.contentWidth);
        h += tableH;
      } else {
        // text or list — same as before
        const bw = antiWidowWidth(seg.content, bodyFont, layout.contentWidth);
        const prepared = deps.prepareWithSegments(seg.content, bodyFont, { whiteSpace: "pre-wrap" });
        let cursor = { segmentIndex: 0, graphemeIndex: 0 };
        while (true) {
          const line = deps.layoutNextLine(prepared, cursor, bw);
          if (line === null) break;
          const isEmpty = line.text.trim() === "";
          h += isEmpty ? Math.round(bodyLineHeight * deps.paragraphGap) : bodyLineHeight;
          cursor = line.end;
        }
      }
    }
  }
  return h;
}

function renderTextSegment(ctx, theme, layout, seg, y, bodyFont, bodyLineHeight, deps) {
  const bodyW = deps.antiWidowWidth(seg.content, bodyFont, layout.contentWidth);
  ctx.fillStyle = theme.mutedForeground;
  ctx.font = bodyFont;
  let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
  const bodyPrepared = deps.prepareWithSegments(seg.content, bodyFont, { whiteSpace: "pre-wrap" });
  while (true) {
    const line = deps.layoutNextLine(bodyPrepared, bCursor, bodyW);
    if (line === null) break;
    const isEmpty = line.text.trim() === "";
    if (!isEmpty) ctx.fillText(line.text, layout.contentX, y);
    bCursor = line.end;
    y += isEmpty ? Math.round(bodyLineHeight * deps.paragraphGap) : bodyLineHeight;
  }
  return y;
}

async function renderCalloutSegment(ctx, theme, layout, seg, y, bodyFont, bodyLineHeight, deps) {
  const pad = SEGMENT_PAD.callout;
  const emojiSize = Math.round(deps.TOKENS.type.body.size * 1.2);
  const emojiGap = 8;
  const hasEmojiImg = seg.emoji && deps.isEmoji(seg.emoji);
  let emojiImg = null;
  if (hasEmojiImg) {
    emojiImg = await deps.loadEmojiImage(seg.emoji);
  }
  const emojiOffset = emojiImg ? emojiSize + emojiGap : 0;
  const innerW = layout.contentWidth - pad.left - pad.right - emojiOffset;
  // If emoji image failed, fall back to ASCII prefix
  const displayText = (!emojiImg && seg.emoji
    ? (deps.EMOJI_ASCII_FALLBACK[seg.emoji] || seg.emoji) + " "
    : "") + seg.content;
  const textH = deps.measureTextHeight(displayText, bodyFont, innerW, bodyLineHeight);
  const minH = emojiImg ? Math.max(textH, emojiSize) : textH;
  const boxH = pad.top + minH + pad.bottom;

  deps.drawCardBg(ctx, theme, layout.contentX, y, layout.contentWidth, boxH);

  // Left accent border
  ctx.save();
  ctx.fillStyle = theme.foreground;
  ctx.globalAlpha = theme.calloutAccentAlpha ?? 0.6;
  deps.roundRect(ctx, layout.contentX, y, pad.borderWidth, boxH, pad.borderWidth / 2);
  ctx.fill();
  ctx.restore();

  // Emoji image
  if (emojiImg) {
    const emojiX = layout.contentX + pad.left;
    const emojiY = y + pad.top + Math.round((bodyLineHeight - emojiSize) / 2);
    ctx.drawImage(emojiImg, emojiX, emojiY, emojiSize, emojiSize);
  }

  // Text
  ctx.fillStyle = theme.mutedForeground;
  ctx.font = bodyFont;
  let bCursor = { segmentIndex: 0, graphemeIndex: 0 };
  const prepared = deps.prepareWithSegments(displayText, bodyFont, { whiteSpace: "pre-wrap" });
  let ty = y + pad.top;
  const textX = layout.contentX + pad.left + emojiOffset;
  while (true) {
    const line = deps.layoutNextLine(prepared, bCursor, innerW);
    if (line === null) break;
    const isEmpty = line.text.trim() === "";
    if (!isEmpty) ctx.fillText(line.text, textX, ty);
    bCursor = line.end;
    ty += isEmpty ? Math.round(bodyLineHeight * deps.paragraphGap) : bodyLineHeight;
  }
  return y + boxH;
}

async function renderCodeSegment(ctx, theme, layout, seg, y, codeStyle, deps) {
  const pad = {
    top: codeStyle.codePadTop,
    bottom: codeStyle.codePadBottom,
    left: codeStyle.codePadLeft,
    right: codeStyle.codePadRight,
  };
  const innerW = layout.contentWidth - pad.left - pad.right;
  const textH = deps.measureCodeHeight(ctx, seg.content, codeStyle.codeFontSize, codeStyle.codeLineHeight, innerW);
  const boxH = pad.top + textH + pad.bottom;

  deps.drawCardBg(ctx, theme, layout.contentX, y, layout.contentWidth, boxH);

  // Syntax-highlighted code via Shiki (falls back to plain mono)
  const codeRendered = await deps.renderCodeTokens(
    ctx,
    seg.content,
    seg.lang || seg.language || "text",
    layout.contentX + pad.left,
    y + pad.top,
    innerW,
    theme.palette,
    codeStyle.codeFontSize,
    codeStyle.codeLineHeight,
    theme,
  );
  if (codeRendered === null) {
    // Fallback: plain monochrome
    ctx.fillStyle = theme.subtleForeground;
    ctx.font = deps.monoFontString(codeStyle.codeFontSize);
    ctx.textBaseline = "top";
    let ty = y + pad.top;
    for (const line of seg.content.split("\n")) {
      if (line.length === 0) {
        ty += codeStyle.codeLineHeight;
        continue;
      }

      let curX = 0;
      for (let ci = 0; ci < line.length; ) {
        const fit = deps.fitCodeChunk(ctx, line.slice(ci), curX, innerW);
        if (fit) {
          ctx.fillText(fit.chunk, layout.contentX + pad.left + curX, ty);
          curX += fit.width;
          ci += fit.chunk.length;
        } else {
          curX = 0;
          ty += codeStyle.codeLineHeight;
        }
      }
      ty += codeStyle.codeLineHeight;
    }
  }
  return y + boxH;
}

async function renderTableSegment(ctx, theme, layout, seg, y, bodyFont, bodyLineHeight, deps) {
  const tableH = deps.renderTableChunk(
    ctx,
    theme,
    layout,
    seg,
    layout.contentX,
    y,
    layout.contentWidth,
    bodyFont,
    bodyLineHeight,
  );
  return y + tableH;
}

export async function renderSectionBody({
  ctx,
  theme,
  layout,
  section,
  bodyFont,
  bodyLineHeight,
  codeStyle,
  y,
  deps,
}) {
  const segments = normalizeBody(section.body);
  if (!segments) return y;

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (si > 0) y += SEGMENT_GAP;

    if (seg.type === "callout") {
      y = await renderCalloutSegment(ctx, theme, layout, seg, y, bodyFont, bodyLineHeight, deps);
    } else if (seg.type === "code") {
      y = await renderCodeSegment(ctx, theme, layout, seg, y, codeStyle, deps);
    } else if (seg.type === "table") {
      y = await renderTableSegment(ctx, theme, layout, seg, y, bodyFont, bodyLineHeight, deps);
    } else {
      y = renderTextSegment(ctx, theme, layout, seg, y, bodyFont, bodyLineHeight, deps);
    }
  }

  return y;
}
