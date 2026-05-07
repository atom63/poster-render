import { SEGMENT_PAD } from "./render-segments.js";

function tableCellText(value) {
  return value == null ? "" : String(value);
}

function fitTableColumnWidths(preferredWidths, availableWidth) {
  if (preferredWidths.length === 0) return [];
  const totalPreferred = preferredWidths.reduce((sum, width) => sum + width, 0);
  if (totalPreferred <= availableWidth) return preferredWidths;

  const minWidth = Math.max(56, Math.floor(availableWidth / preferredWidths.length));
  let widths = preferredWidths.map((width) => Math.max(minWidth, Math.floor((width * availableWidth) / totalPreferred)));
  let total = widths.reduce((sum, width) => sum + width, 0);

  if (total > availableWidth) {
    widths = Array.from({ length: preferredWidths.length }, (_, index) => {
      const base = Math.floor(availableWidth / preferredWidths.length);
      return base + (index < availableWidth % preferredWidths.length ? 1 : 0);
    });
    total = widths.reduce((sum, width) => sum + width, 0);
  }

  while (total < availableWidth) {
    for (let i = 0; i < widths.length && total < availableWidth; i++) {
      widths[i]++;
      total++;
    }
  }

  return widths;
}

function measureTableLayout(ctx, table, font, lineHeight, maxWidth, deps = {}) {
  const { measureTextHeight } = deps;
  const pad = SEGMENT_PAD.table;
  const rows = [table.header || [], ...(table.rows || [])];
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const grid = pad.grid;
  const availableForColumns = Math.max(0, maxWidth - pad.left - pad.right - grid * (columnCount + 1));

  const preferredWidths = Array.from({ length: columnCount }, (_, col) => {
    let width = 0;
    for (const row of rows) {
      ctx.font = font;
      width = Math.max(width, ctx.measureText(tableCellText(row[col])).width);
    }
    return Math.ceil(width) + pad.cellX * 2;
  });

  const widths = fitTableColumnWidths(preferredWidths, availableForColumns);
  const innerWidths = widths.map((width) => Math.max(0, width - pad.cellX * 2));
  const rowHeights = rows.map((row) => {
    let maxHeight = lineHeight;
    for (let col = 0; col < columnCount; col++) {
      const text = tableCellText(row[col]);
      const cellHeight = measureTextHeight(text, font, Math.max(1, innerWidths[col]), lineHeight);
      maxHeight = Math.max(maxHeight, cellHeight);
    }
    return maxHeight + pad.cellY * 2;
  });

  const headerHeight = rowHeights[0] ?? lineHeight + pad.cellY * 2;
  const bodyHeights = rowHeights.slice(1);
  const totalHeight = pad.top + headerHeight + grid + bodyHeights.reduce((sum, height) => sum + grid + height, pad.bottom);

  return {
    pad,
    grid,
    widths,
    innerWidths,
    headerHeight,
    rowHeights: bodyHeights,
    totalHeight,
    columnCount,
  };
}

function splitTableIntoChunks(table, ctx, font, lineHeight, maxWidth, firstMaxHeight, nextMaxHeight, deps = {}) {
  const layout = measureTableLayout(ctx, table, font, lineHeight, maxWidth, deps);
  const chunks = [];
  const rows = table.rows || [];
  let start = 0;
  let chunkLimit = Math.max(1, firstMaxHeight);

  if (rows.length === 0) {
    return [{
      type: "table",
      header: table.header || [],
      rows: [],
      alignments: table.alignments || [],
      _tableLayout: layout,
    }];
  }

  while (start < rows.length) {
    let end = start;
    let chunkHeight = layout.pad.top + layout.headerHeight + layout.grid + layout.pad.bottom;
    while (end < rows.length) {
      const nextHeight = layout.rowHeights[end] + layout.grid;
      if (end > start && chunkHeight + nextHeight > chunkLimit) break;
      if (end === start && chunkHeight + nextHeight > chunkLimit) {
        chunkHeight += nextHeight;
        end++;
        break;
      }
      chunkHeight += nextHeight;
      end++;
    }
    chunks.push({
      type: "table",
      header: table.header || [],
      rows: rows.slice(start, end),
      alignments: table.alignments || [],
      _tableLayout: layout,
    });
    start = end;
    chunkLimit = nextMaxHeight;
  }

  return chunks;
}

function renderTableChunk(ctx, theme, layout, table, x, y, maxWidth, font, lineHeight, deps = {}) {
  const { drawCardBg, roundRect, collectLines } = deps;
  const tableLayout = table._tableLayout || measureTableLayout(ctx, table, font, lineHeight, maxWidth, deps);
  const { pad, grid, widths, innerWidths } = tableLayout;
  const allRows = [table.header || [], ...(table.rows || [])];
  const rowHeights = [tableLayout.headerHeight, ...tableLayout.rowHeights];
  const tableHeight = pad.top + rowHeights[0] + grid + rowHeights.slice(1).reduce((sum, height) => sum + grid + height, pad.bottom);
  const contentHeight = Math.max(0, tableHeight - pad.bottom);

  // Draw only the actual card content area; reserve pad.bottom as page background space.
  drawCardBg(ctx, theme, x, y, maxWidth, contentHeight);

  const drawRow = (row, rowIndex, rowY, isHeader = false) => {
    let cellX = x + pad.left + grid;
    const rowHeight = rowHeights[rowIndex];

    if (isHeader) {
      ctx.save();
      ctx.fillStyle = theme.foreground;
      ctx.globalAlpha = theme.headerTintAlpha ?? 0.05;
      roundRect(ctx, x + pad.left, rowY, maxWidth - pad.left - pad.right, rowHeight, 10);
      ctx.fill();
      ctx.restore();
    }

    for (let col = 0; col < widths.length; col++) {
      const cellWidth = widths[col];
      const innerW = Math.max(1, innerWidths[col]);
      const text = tableCellText(row[col]);
      const lines = collectLines(text, font, innerW);
      const contentHeight = lines.length * lineHeight;
      const textTop = rowY + Math.round((rowHeight - contentHeight) / 2);
      const align = table.alignments?.[col] || "left";
      const textX = align === "right"
        ? cellX + cellWidth - pad.cellX
        : align === "center"
          ? cellX + Math.round(cellWidth / 2)
          : cellX + pad.cellX;

      ctx.save();
      ctx.fillStyle = isHeader ? theme.foreground : theme.mutedForeground;
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.textAlign = align;
      let ty = textTop;
      for (const line of lines) {
        ctx.fillText(line.text, textX, ty);
        ty += lineHeight;
      }
      ctx.restore();

      cellX += cellWidth + grid;
    }
  };

  // Outer border and grid
  ctx.save();
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = theme.borderAlpha ?? 0.15;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, maxWidth, tableHeight, 14) : roundRect(ctx, x, y, maxWidth, tableHeight, 14);
  ctx.stroke();
  ctx.restore();

  let rowY = y + pad.top;
  drawRow(allRows[0] || [], 0, rowY, true);
  rowY += rowHeights[0] + grid;
  for (let rowIndex = 1; rowIndex < allRows.length; rowIndex++) {
    drawRow(allRows[rowIndex], rowIndex, rowY, false);
    rowY += rowHeights[rowIndex] + grid;
  }

  // Horizontal grid lines
  ctx.save();
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = theme.gridAlpha ?? 0.12;
  ctx.lineWidth = 1;
  let lineY = y + pad.top + rowHeights[0];
  ctx.beginPath();
  ctx.moveTo(x + pad.left, lineY);
  ctx.lineTo(x + maxWidth - pad.right, lineY);
  ctx.stroke();
  lineY += grid;
  for (let rowIndex = 1; rowIndex < rowHeights.length; rowIndex++) {
    lineY += rowHeights[rowIndex - 1];
    ctx.beginPath();
    ctx.moveTo(x + pad.left, lineY);
    ctx.lineTo(x + maxWidth - pad.right, lineY);
    ctx.stroke();
    lineY += grid;
  }
  ctx.restore();

  // Vertical lines
  ctx.save();
  ctx.strokeStyle = theme.foreground;
  ctx.globalAlpha = theme.gridAlpha ?? 0.12;
  ctx.lineWidth = 1;
  let colX = x + pad.left;
  for (let col = 0; col <= widths.length; col++) {
    ctx.beginPath();
    ctx.moveTo(colX, y + pad.top);
    ctx.lineTo(colX, y + contentHeight);
    ctx.stroke();
    colX += (widths[col] || 0) + grid;
  }
  ctx.restore();

  return tableHeight;
}

function measureTableSegmentHeight(ctx, table, font, lineHeight, maxWidth, deps = {}) {
  return measureTableLayout(ctx, table, font, lineHeight, maxWidth, deps).totalHeight;
}

export {
  tableCellText,
  fitTableColumnWidths,
  measureTableLayout,
  splitTableIntoChunks,
  renderTableChunk,
  measureTableSegmentHeight,
};
