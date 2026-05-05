#!/usr/bin/env node
import fs from "fs";
import path from "path";

function usage() {
  console.error(`Usage: node markdown-to-content.js <input.md> [--output content.json]\n\nMappings:\n  #   -> cover title\n  first paragraph after # -> cover subtitle\n  ##/### -> section headline\n  paragraphs -> body text\n  fenced code blocks -> code segments\n  --- -> section break`);
}

function parseArgs(argv) {
  const args = { input: null, output: "content.json", help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--output") {
      args.output = argv[++i];
    } else if (!arg.startsWith("-") && !args.input) {
      args.input = arg;
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
  const m = line.match(/^(#{1,3})\s+(.*)$/);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

function flushParagraph(lines) {
  const text = cleanText(lines.join(" "));
  lines.length = 0;
  return text;
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
  if (!section.headline && !section.body) return null;
  return section;
}

function parseMarkdown(markdown, inputFile) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const cover = { title: "", subtitle: "" };
  const sections = [];
  const introRef = { current: null };
  const activeRef = { current: null };
  let titleSeen = false;
  let subtitleSeen = false;
  let sectionMode = false;
  let paragraphLines = [];
  let inCode = false;
  let codeFence = null;
  let codeLang = "text";
  let codeLines = [];

  const flushIntro = () => {
    const finalized = finalizeSection(introRef.current);
    if (finalized) sections.push(finalized);
    introRef.current = null;
  };

  const flushActive = () => {
    const finalized = finalizeSection(activeRef.current);
    if (finalized) sections.push(finalized);
    activeRef.current = null;
  };

  const routeText = (text) => {
    if (!text) return;
    if (!sectionMode) {
      appendText(ensureSection(introRef), text);
      return;
    }
    appendText(ensureSection(activeRef), text);
  };

  const routeCode = (content, lang) => {
    if (!content) return;
    if (!sectionMode) {
      appendCode(ensureSection(introRef), content, lang);
      return;
    }
    appendCode(ensureSection(activeRef), content, lang);
  };

  const flushParagraphIfAny = () => {
    if (paragraphLines.length === 0) return;
    const text = flushParagraph(paragraphLines);
    if (!text) return;
    if (titleSeen && !subtitleSeen && !sectionMode) {
      cover.subtitle = text;
      subtitleSeen = true;
      return;
    }
    routeText(text);
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (inCode) {
      const fence = isFence(line);
      if (fence && fence.marker === codeFence) {
        routeCode(codeLines.join("\n"), codeLang);
        inCode = false;
        codeFence = null;
        codeLang = "text";
        codeLines = [];
        continue;
      }
      codeLines.push(line);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraphIfAny();
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      flushParagraphIfAny();
      inCode = true;
      codeFence = fence.marker;
      codeLang = fence.lang;
      codeLines = [];
      continue;
    }

    if (isHr(line)) {
      flushParagraphIfAny();
      flushIntro();
      flushActive();
      sectionMode = false;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      flushParagraphIfAny();
      if (heading.level === 1 && !titleSeen) {
        cover.title = heading.text;
        titleSeen = true;
        continue;
      }

      if (!sectionMode) {
        flushIntro();
        sectionMode = true;
      } else {
        flushActive();
      }
      activeRef.current = { headline: heading.text };
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraphIfAny();

  if (inCode) {
    routeCode(codeLines.join("\n"), codeLang);
  }

  if (!sectionMode) {
    flushIntro();
  } else {
    flushActive();
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

main().catch((err) => {
  console.error(`[markdown-to-content] ${err?.stack || err?.message || err}`);
  process.exit(1);
});
