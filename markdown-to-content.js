#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function usage() {
  console.error(`Usage: node markdown-to-content.js <input.md> [--output content.json]\n\nSupported blocks:\n  # / ## / ###   -> cover + section headings\n  paragraphs     -> body text\n  > blockquotes  -> callout cards\n  - / 1. lists   -> bullet text blocks\n  [ ] task lists -> task list text\n  fenced code    -> code cards\n  ![img](path)   -> section image\n  | table |      -> real table card\n  ---            -> section break`);
}

function parseArgs(argv) {
  const args = { input: null, output: "content.json", help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--output") {
      const next = argv[++i];
      if (!next || next.startsWith("-")) {
        throw new Error("--output requires a file path");
      }
      args.output = next;
    } else if (!arg.startsWith("-") && !args.input) {
      args.input = arg;
    } else if (!arg.startsWith("-")) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function cleanText(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function isFence(line) {
  const m = line.match(/^(```|~~~)([^`]*)\s*$/);
  if (!m) return null;
  return { marker: m[1], lang: m[2].trim() || "text" };
}

function isHr(line) {
  return /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line);
}

function isHeading(line) {
  const m = line.match(/^(#{1,6})\s+(.*)$/);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

function isStandaloneImage(line) {
  const m = line.match(/^\s*!\[([^\]]*)\]\((.*?)\)\s*$/);
  if (!m) return null;
  return { alt: m[1].trim(), src: m[2].trim() };
}

function isQuoteLine(line) {
  const m = line.match(/^\s*>\s?(.*)$/);
  if (!m) return null;
  return m[1];
}

function parseListItem(line) {
  const m = line.match(/^([ \t]*)(?:([-*+])|(\d+\.))(?:\s+\[([ xX])\])?\s+(.*)$/);
  if (!m) return null;
  const indent = m[1].replace(/\t/g, "  ");
  const marker = m[2] || m[3];
  const taskMark = m[4];
  const content = m[5].trimEnd();

  if (taskMark !== undefined) {
    return {
      kind: "task",
      indent,
      checked: /x/i.test(taskMark),
      content,
    };
  }

  if (/^\d+\.$/.test(marker)) {
    return {
      kind: "ordered",
      indent,
      number: marker.replace(/\.$/, ""),
      content,
    };
  }

  return {
    kind: "unordered",
    indent,
    bullet: marker,
    content,
  };
}

function isTableSeparator(line) {
  return isTableSeparatorRow(line);
}

function isTableRow(line) {
  return /\|/.test(line);
}

function stripFrontMatter(lines) {
  if (lines.length < 3) return lines;
  if (lines[0].trim() !== "---") return lines;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines.slice(i + 1);
    }
  }
  return lines;
}

function ensureSection(targetRef) {
  if (!targetRef.current) targetRef.current = {};
  return targetRef.current;
}

function appendText(section, text) {
  if (!text) return;
  if (!section.body) section.body = [];
  const last = section.body[section.body.length - 1];
  if (last && last.type === "text") {
    last.content += `\n\n${text}`;
  } else {
    section.body.push({ type: "text", content: text });
  }
}

function appendCode(section, content, lang) {
  if (!content) return;
  if (!section.body) section.body = [];
  section.body.push({ type: "code", content, lang: lang && lang !== "text" ? lang : undefined });
}

function appendCallout(section, content) {
  if (!content) return;
  if (!section.body) section.body = [];
  section.body.push({ type: "callout", content });
}

function appendList(section, content) {
  if (!content) return;
  if (!section.body) section.body = [];
  section.body.push({ type: "list", content });
}

function formatListBlock(items) {
  return items
    .map((item) => {
      if (item.kind === "task") {
        return `${item.indent}- [${item.checked ? "x" : " "}] ${item.content}`;
      }
      if (item.kind === "ordered") {
        return `${item.indent}${item.number}. ${item.content}`;
      }
      return `${item.indent}• ${item.content}`;
    })
    .join("\n");
}

function appendTable(section, table) {
  if (!table) return;
  if (!section.body) section.body = [];
  section.body.push({ type: "table", ...table });
}

function splitTableCells(line) {
  const placeholder = "__MD_PIPE__";
  const cleaned = line.trim().replace(/\\\|/g, placeholder).replace(/^\|/, "").replace(/\|$/, "");
  return cleaned.split("|").map((cell) => cell.replaceAll(placeholder, "|").trim());
}

function isTableSeparatorRow(line) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function parseTableAlignments(line, columnCount) {
  const cells = splitTableCells(line);
  return Array.from({ length: columnCount }, (_, index) => {
    const cell = cells[index] ?? "";
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "left";
  });
}

function formatTableBlock(lines) {
  const rows = lines
    .filter((line) => !isTableSeparatorRow(line))
    .map(splitTableCells)
    .filter((cells) => cells.length > 0);

  if (rows.length === 0) {
    return null;
  }

  const header = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const alignments = lines.some(isTableSeparatorRow)
    ? parseTableAlignments(lines.find(isTableSeparatorRow) ?? "", Math.max(...rows.map((row) => row.length)))
    : Array.from({ length: Math.max(...rows.map((row) => row.length)) }, () => "left");

  return {
    header,
    rows: bodyRows,
    alignments,
  };
}

function finalizeSection(section) {
  if (!section) return null;
  if (section.body && section.body.length === 0) delete section.body;
  if (Array.isArray(section.body)) {
    section.body = section.body.filter(Boolean).map((seg) => {
      if (seg.type === "code" && !seg.lang) {
        const { lang, ...rest } = seg;
        return rest;
      }
      return seg;
    });
    if (section.body.length === 0) delete section.body;
  }
  if (!section.headline && !section.body && !section.image) return null;
  return section;
}

function parseMarkdown(markdown, inputFile) {
  const lines = stripFrontMatter(markdown.replace(/\r\n/g, "\n").split("\n"));
  const cover = { title: "", subtitle: "" };
  const sections = [];
  const introRef = { current: null };
  const activeRef = { current: null };
  let titleSeen = false;
  let subtitleSeen = false;
  let sectionMode = false;
  let block = null;
  let inCode = false;
  let codeFence = null;
  let codeLang = "text";
  let codeLines = [];

  const currentRef = () => (sectionMode ? activeRef : introRef);
  const currentSection = () => ensureSection(currentRef());

  const flushCurrentSection = () => {
    const finalized = finalizeSection(currentRef().current);
    if (finalized) sections.push(finalized);
    currentRef().current = null;
  };

  const flushBlock = () => {
    if (!block) return;
    const section = currentSection();

    if (block.type === "paragraph") {
      const text = cleanText(block.lines.join(" "));
      if (titleSeen && !subtitleSeen && !sectionMode) {
        cover.subtitle = text;
        subtitleSeen = true;
      } else {
        appendText(section, text);
      }
    } else if (block.type === "quote") {
      appendCallout(section, cleanText(block.lines.join("\n")));
    } else if (block.type === "list") {
      appendList(section, cleanText(formatListBlock(block.items)));
    } else if (block.type === "table") {
      appendTable(section, formatTableBlock(block.lines));
    }

    block = null;
  };

  const flushAndResetToIntro = () => {
    flushBlock();
    flushCurrentSection();
    sectionMode = false;
  };

  const startSection = (headline) => {
    flushBlock();
    flushCurrentSection();
    sectionMode = true;
    activeRef.current = { headline };
  };

  const pushParagraphLine = (line) => {
    if (!block || block.type !== "paragraph") {
      flushBlock();
      block = { type: "paragraph", lines: [] };
    }
    block.lines.push(line);
  };

  const pushQuoteLine = (content) => {
    if (!block || block.type !== "quote") {
      flushBlock();
      block = { type: "quote", lines: [] };
    }
    block.lines.push(content);
  };

  const pushListItem = (item) => {
    if (!block || block.type !== "list" || block.kind !== item.kind) {
      flushBlock();
      block = { type: "list", kind: item.kind, items: [] };
    }
    block.items.push(item);
  };

  const pushTableLine = (line) => {
    if (!block || block.type !== "table") {
      flushBlock();
      block = { type: "table", lines: [] };
    }
    block.lines.push(line);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] ?? "";
    const trimmed = line.trim();

    if (inCode) {
      const fence = isFence(line);
      if (fence && fence.marker === codeFence) {
        const codeText = codeLines.join("\n");
        const section = currentSection();
        appendCode(section, codeText, codeLang);
        inCode = false;
        codeFence = null;
        codeLang = "text";
        codeLines = [];
        continue;
      }
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushBlock();
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      flushBlock();
      if (heading.level === 1 && !titleSeen) {
        cover.title = heading.text;
        titleSeen = true;
        continue;
      }
      if (!sectionMode) {
        flushCurrentSection();
        sectionMode = true;
      } else {
        flushCurrentSection();
      }
      activeRef.current = { headline: heading.text };
      continue;
    }

    if (isHr(line)) {
      flushAndResetToIntro();
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      flushBlock();
      inCode = true;
      codeFence = fence.marker;
      codeLang = fence.lang;
      codeLines = [];
      continue;
    }

    const image = isStandaloneImage(line);
    if (image) {
      flushBlock();
      const section = currentSection();
      section.image = image.src;
      if (image.alt) section.imageAlt = image.alt;
      continue;
    }

    const quote = isQuoteLine(line);
    if (quote !== null) {
      pushQuoteLine(quote);
      continue;
    }

    const listItem = parseListItem(line);
    if (listItem) {
      pushListItem(listItem);
      continue;
    }

    if (isTableRow(line) && isTableSeparator(nextLine)) {
      pushTableLine(line);
      continue;
    }

    if (block && block.type === "table" && (isTableRow(line) || isTableSeparator(line))) {
      pushTableLine(line);
      continue;
    }

    pushParagraphLine(line);
  }

  flushBlock();

  if (inCode) {
    const section = currentSection();
    appendCode(section, codeLines.join("\n"), codeLang);
  }

  if (!sectionMode) {
    flushCurrentSection();
  } else {
    flushCurrentSection();
  }

  if (!cover.title) {
    cover.title = path.basename(inputFile, path.extname(inputFile)) || "poster";
  }
  if (!cover.subtitle) {
    cover.subtitle = "";
  }

  return {
    cover,
    sections,
    sourceDir: path.dirname(inputFile),
    cta: "继续用 Markdown 迭代内容，再运行 markdown-to-content.js 和 poster-render。",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const markdown = fs.readFileSync(inputPath, "utf8");
  const content = parseMarkdown(markdown, inputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(content, null, 2)}\n`);
  console.error(`[markdown-to-content] wrote ${outputPath}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    console.error(`[markdown-to-content] ${err?.stack || err?.message || err}`);
    process.exit(1);
  });
}

export { parseMarkdown };
