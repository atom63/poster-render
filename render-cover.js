export async function renderCover(content, theme, layout, totalSlides, template, deps = {}) {
  const {
    TOKENS,
    path,
    loadImage,
    fontString,
    antiWidowWidth,
    prepareWithSegments,
    layoutNextLine,
    createSlideCanvas,
    drawSlideCounter,
    createCanvas,
  } = deps;
  const { canvas, ctx } = createSlideCanvas(theme, deps.patternContext || {});

  if (content.cover.coverImage) {
    const W = TOKENS.canvas.width;
    const H = TOKENS.canvas.height;
    const cover = content.cover;
    const coverStyle = cover.coverStyle || template.coverStyle || "card";

    // Shared font setup
    const cardTitleSize = Math.round(TOKENS.type.headline.size * 1.4); // ~73px
    const cardTitleLH   = Math.round(cardTitleSize * 1.33);
    const fm = TOKENS.fonts[theme.fontFamily] || TOKENS.fonts.sans;
    const titleFont = `${TOKENS.type.headline.weight} ${cardTitleSize}px "${fm.name}", ${fm.fallback}, "Apple Color Emoji"`;
    const subFont   = fontString("body", theme.fontFamily);

    // Load image (fallback to placeholder on error)
    const resolved = path.isAbsolute(cover.coverImage)
      ? cover.coverImage
      : path.resolve(cover.coverImage);
    let img = null;
    try { img = await loadImage(resolved); }
    catch (e) { console.warn(`Failed to load cover image: ${e.message}`); }

    // Draw image crop-to-fill (object-fit: cover) into any rect
    function drawCoverImg(dx, dy, dw, dh) {
      if (!img) { ctx.fillStyle = theme.mutedForeground + "33"; ctx.fillRect(dx, dy, dw, dh); return; }
      const targetRatio = dw / dh;
      const imgRatio = img.width / img.height;
      let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
      if (imgRatio > targetRatio) { srcW = Math.round(img.height * targetRatio); srcX = Math.round((img.width - srcW) / 2); }
      else { srcH = Math.round(img.width / targetRatio); }
      ctx.drawImage(img, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
    }

    // Clip to a rounded rect, run fn, then restore
    function withRoundedClip(x, y, w, h, tl, tr, br, bl, fn) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + tl, y);
      ctx.lineTo(x + w - tr, y); ctx.quadraticCurveTo(x + w, y,     x + w, y + tr);
      ctx.lineTo(x + w, y + h - br); ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
      ctx.lineTo(x + bl, y + h); ctx.quadraticCurveTo(x,     y + h, x,     y + h - bl);
      ctx.lineTo(x, y + tl); ctx.quadraticCurveTo(x, y, x + tl, y);
      ctx.closePath();
      ctx.clip();
      fn();
      ctx.restore();
    }

    // Text renderer (left-aligned unless ctx.textAlign is set externally)
    function hasCjk(text) {
      return /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text);
    }

    function hasLatin(text) {
      return /[A-Za-z]/.test(text);
    }

    // Tiny optical tweak for bilingual cover text:
    // Latin-heavy lines tend to look a touch taller/airier than CJK lines at the same nominal line height.
    // Tighten them slightly on cover text only, so bilingual titles feel more even.
    function coverLineAdvance(text, baseLineH) {
      const latin = hasLatin(text);
      const cjk = hasCjk(text);
      if (latin && cjk) return Math.round(baseLineH * 0.95);
      if (latin) return Math.round(baseLineH * 0.93);
      return baseLineH;
    }

    function drawTextBlock(text, font, color, x, startY, maxW, lineH) {
      ctx.fillStyle = color;
      ctx.font = font;
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      const prepared = prepareWithSegments(text, font, { whiteSpace: "pre-wrap" });
      let y = startY;
      while (true) {
        const line = layoutNextLine(prepared, cursor, maxW);
        if (line === null) break;
        ctx.fillText(line.text, x, y);
        cursor = line.end;
        y += coverLineAdvance(line.text, lineH);
      }
      return y;
    }

    if (coverStyle === "fluid") {
      // Full-bleed image, smooth gradient overlay starting at 40%, text on top
      withRoundedClip(0, 0, W, H, 0, 0, 0, 0, () => drawCoverImg(0, 0, W, H));

      // Extract dominant color from bottom 10% of image for gradient end
      function extractBottomColor(srcImg) {
        const sc = createCanvas(srcImg.width, srcImg.height);
        const sCtx = sc.getContext("2d");
        sCtx.drawImage(srcImg, 0, 0);
        const bottomY = Math.floor(srcImg.height * 0.9);
        const data = sCtx.getImageData(0, bottomY, srcImg.width, srcImg.height - bottomY).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; count++; }
        return { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) };
      }

      const { r: er, g: eg, b: eb } = img ? extractBottomColor(img) : { r: 0, g: 0, b: 0 };
      const lumEnd = 0.299 * er + 0.587 * eg + 0.114 * eb;
      const endRgba = (a) => `rgba(${er},${eg},${eb},${a})`;
      // Text color: dark if extracted color is light, white if dark
      const textColor    = lumEnd > 128 ? theme.foreground   : "#FFFFFF";
      const subTextColor = lumEnd > 128 ? theme.mutedForeground : "rgba(255,255,255,0.75)";

      // Gradient starts at 40%, multi-stop for natural fade to extracted color
      const gradStart = Math.round(H * 0.40);
      const grad = ctx.createLinearGradient(0, gradStart, 0, H);
      grad.addColorStop(0,    endRgba(0));
      grad.addColorStop(0.30, endRgba(0.12));
      grad.addColorStop(0.55, endRgba(0.45));
      grad.addColorStop(0.80, endRgba(0.85));
      grad.addColorStop(1,    endRgba(1));
      ctx.fillStyle = grad;
      ctx.fillRect(0, gradStart, W, H - gradStart);

      let y = Math.round(H * 0.64);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 2;
      y = drawTextBlock(cover.title, titleFont, textColor, layout.contentX, y, antiWidowWidth(cover.title, titleFont, layout.contentWidth), cardTitleLH);
      ctx.shadowBlur = 8;
      if (cover.subtitle) {
        y += layout.headlineToBody;
        drawTextBlock(cover.subtitle, subFont, subTextColor, layout.contentX, y, antiWidowWidth(cover.subtitle, subFont, layout.contentWidth), TOKENS.type.body.lineHeight);
      }
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    } else if (coverStyle === "inset") {
      // Near-edge image (16px gap), all-round corners, drop shadow + inset shadow
      const insetPad = 16;
      const imgW = W - 2 * insetPad;
      const imgH = Math.round(H * 0.50);
      const r = 24;
      const ix = insetPad, iy = insetPad;

      // Uniform-radius rounded rect path helper
      function rrPath(x, y, w, h, rad) {
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y,     x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x,     y + h, x,     y + h - rad);
        ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x,     y,     x + rad, y);
        ctx.closePath();
      }

      // Drop shadow: draw filled shape behind image with canvas shadow
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 12;
      rrPath(ix, iy, imgW, imgH, r);
      ctx.fillStyle = theme.background;
      ctx.fill();
      ctx.restore();

      // Image + inset shadow (all inside same rounded clip)
      ctx.save();
      rrPath(ix, iy, imgW, imgH, r);
      ctx.clip();
      drawCoverImg(ix, iy, imgW, imgH);
      // Inset shadow — top edge
      const topGrad = ctx.createLinearGradient(0, iy, 0, iy + 72);
      topGrad.addColorStop(0, "rgba(0,0,0,0.18)");
      topGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topGrad; ctx.fillRect(ix, iy, imgW, 72);
      // Inset shadow — left edge
      const leftGrad = ctx.createLinearGradient(ix, 0, ix + 48, 0);
      leftGrad.addColorStop(0, "rgba(0,0,0,0.10)");
      leftGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leftGrad; ctx.fillRect(ix, iy, 48, imgH);
      // Inset shadow — right edge
      const rightGrad = ctx.createLinearGradient(ix + imgW - 48, 0, ix + imgW, 0);
      rightGrad.addColorStop(0, "rgba(0,0,0,0)");
      rightGrad.addColorStop(1, "rgba(0,0,0,0.10)");
      ctx.fillStyle = rightGrad; ctx.fillRect(ix + imgW - 48, iy, 48, imgH);
      ctx.restore();

      ctx.textAlign = "center";
      let y = iy + imgH + Math.round(layout.padY * 0.65);
      y = drawTextBlock(cover.title, titleFont, theme.foreground, W / 2, y, layout.contentWidth, cardTitleLH);
      if (cover.subtitle) {
        y += layout.headlineToBody;
        drawTextBlock(cover.subtitle, subFont, theme.mutedForeground, W / 2, y, layout.contentWidth, TOKENS.type.body.lineHeight);
      }
      ctx.textAlign = "left";

    } else {
      // "card" — image top ~55% with rounded top corners, text below left-aligned
      const imgH = Math.round(H * 0.55);
      withRoundedClip(0, 0, W, imgH, 40, 40, 0, 0, () => drawCoverImg(0, 0, W, imgH));

      let y = imgH + Math.round(layout.padY * 0.75);
      if (cover.kicker) {
        y = drawTextBlock(cover.kicker, subFont, theme.mutedForeground, layout.contentX, y, antiWidowWidth(cover.kicker, subFont, layout.contentWidth), TOKENS.type.subtitle.lineHeight);
        y += Math.round(layout.headlineToBody * 0.65);
      }
      y = drawTextBlock(cover.title, titleFont, theme.foreground, layout.contentX, y, antiWidowWidth(cover.title, titleFont, layout.contentWidth), cardTitleLH);
      if (cover.subtitle) {
        y += layout.headlineToBody;
        drawTextBlock(cover.subtitle, subFont, theme.mutedForeground, layout.contentX, y, antiWidowWidth(cover.subtitle, subFont, layout.contentWidth), TOKENS.type.body.lineHeight);
      }
    }
  } else {
    // Text-only cover (existing behaviour)
    const titleFont = fontString("title", theme.fontFamily);
    const subFont   = fontString("subtitle", theme.fontFamily);
    const kickerFont = fontString("small", theme.fontFamily);
    const subtitleGap = Math.round(layout.headlineToBody * 1.5);
    let y = layout.padY;

    if (content.cover.kicker) {
      const kickerW = antiWidowWidth(content.cover.kicker, kickerFont, layout.contentWidth);
      ctx.fillStyle = theme.mutedForeground;
      ctx.font = kickerFont;
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      const kickerPrepared = prepareWithSegments(content.cover.kicker, kickerFont, { whiteSpace: "pre-wrap" });
      while (true) {
        const line = layoutNextLine(kickerPrepared, cursor, kickerW);
        if (line === null) break;
        ctx.fillText(line.text, layout.contentX, y);
        cursor = line.end;
        y += TOKENS.type.small.lineHeight;
      }
      y += Math.round(layout.headlineToBody * 0.7);
    }

    const titleW = antiWidowWidth(content.cover.title, titleFont, layout.contentWidth);
    ctx.fillStyle = theme.foreground;
    ctx.font = titleFont;
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    const titlePrepared = prepareWithSegments(content.cover.title, titleFont, { whiteSpace: "pre-wrap" });
    while (true) {
      const line = layoutNextLine(titlePrepared, cursor, titleW);
      if (line === null) break;
      ctx.fillText(line.text, layout.contentX, y);
      cursor = line.end;
      y += TOKENS.type.title.lineHeight;
    }

    if (content.cover.subtitle) {
      y += subtitleGap;
      const subW = antiWidowWidth(content.cover.subtitle, subFont, layout.contentWidth);
      ctx.fillStyle = theme.mutedForeground;
      ctx.font = subFont;
      cursor = { segmentIndex: 0, graphemeIndex: 0 };
      const subPrepared = prepareWithSegments(content.cover.subtitle, subFont, { whiteSpace: "pre-wrap" });
      while (true) {
        const line = layoutNextLine(subPrepared, cursor, subW);
        if (line === null) break;
        ctx.fillText(line.text, layout.contentX, y);
        cursor = line.end;
        y += TOKENS.type.subtitle.lineHeight;
      }
    }
  }

  drawSlideCounter(ctx, theme, layout, 1, totalSlides);
  return canvas;
}

