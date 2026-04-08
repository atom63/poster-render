/**
 * notion-to-content.js
 * 
 * Parse a Notion page into a poster-render content.json.
 * 
 * Usage:
 *   node notion-to-content.js <page-id> [--output content.json] [--theme '{"palette":"slate"}']
 * 
 * Notion block → content.json mapping:
 *   heading_1/2/3  → new section with headline
 *   paragraph      → body text (consecutive paragraphs join with \n\n)
 *   bulleted/numbered list → body text (joined into current section)
 *   image          → downloaded to ./screenshots/<page-id>-<n>.jpg, inserted as section.image
 *   divider        → section break (force new section even between paragraphs)
 *   First heading_1 → cover.title
 *   First paragraph after cover.title → cover.subtitle
 * 
 * Requires env: NOTION_KEY (or reads from ~/.openclaw/openclaw.json)
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { createWriteStream } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// --- Config ---
const NOTION_VERSION = "2022-06-28";

function getNotionKey() {
  if (process.env.NOTION_KEY) return process.env.NOTION_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".openclaw/openclaw.json"), "utf-8"));
    return cfg?.skills?.entries?.notion?.apiKey;
  } catch {}
  return null;
}

async function notionGet(path_, key) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.notion.com",
      path: path_,
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Notion-Version": NOTION_VERSION,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// Fetch all blocks (handles pagination)
async function fetchAllBlocks(blockId, key) {
  const blocks = [];
  let cursor = undefined;
  while (true) {
    const url = `/v1/blocks/${blockId}/children?page_size=100` + (cursor ? `&start_cursor=${cursor}` : "");
    const res = await notionGet(url, key);
    blocks.push(...(res.results || []));
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return blocks;
}

// Download a URL to a local file
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = createWriteStream(destPath);
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(destPath); });
    }).on("error", (e) => { fs.unlink(destPath, () => {}); reject(e); });
  });
}

// Extract plain text from rich_text array
function richTextToPlain(rich_text = []) {
  return rich_text.map(rt => rt.plain_text || "").join("");
}

// Extract image URL from image block
function getImageUrl(block) {
  const img = block.image;
  if (!img) return null;
  if (img.type === "external") return img.external?.url;
  if (img.type === "file") return img.file?.url;
  return null;
}

// Main parser
async function parseNotion(pageId, key, screenshotsDir) {
  const blocks = await fetchAllBlocks(pageId, key);

  // Also get page metadata for title
  const page = await notionGet(`/v1/pages/${pageId}`, key);
  const pageTitle = page?.properties?.Name?.title?.map(t => t.plain_text).join("") || "";

  const cover = { title: "", subtitle: "" };
  const sections = [];
  let cta = "";

  let coverTitleSet = false;
  let coverSubtitleSet = false;
  let imageCount = 0;

  // We'll build sections as we scan blocks
  // Current accumulator
  let currentSection = null;

  function flushSection() {
    if (!currentSection) return;
    // Clean up body segments
    if (currentSection.body) {
      // Trim leading/trailing empty text segments
      while (currentSection.body.length > 0) {
        const first = currentSection.body[0];
        if (first.type === "text" && !first.content.trim()) {
          currentSection.body.shift();
        } else {
          first.content = first.content.replace(/^\n+/, "");
          break;
        }
      }
      while (currentSection.body.length > 0) {
        const last = currentSection.body[currentSection.body.length - 1];
        if (last.type === "text" && !last.content.trim()) {
          currentSection.body.pop();
        } else {
          last.content = last.content.replace(/\n+$/, "");
          break;
        }
      }
      if (currentSection.body.length === 0) delete currentSection.body;
    }
    if (currentSection.headline || currentSection.body || currentSection.image) {
      sections.push(currentSection);
    }
    currentSection = null;
  }

  function ensureSection() {
    if (!currentSection) currentSection = {};
  }

  // Append text to the last text segment, or create a new one
  function appendTextSegment(text, gap = "\n\n") {
    if (!currentSection.body) currentSection.body = [];
    const segments = currentSection.body;
    const last = segments[segments.length - 1];
    if (last && last.type === "text") {
      last.content += gap + text;
    } else {
      segments.push({ type: "text", content: (segments.length > 0 ? gap : "") + text });
    }
  }

  function appendSegment(seg) {
    if (!currentSection.body) currentSection.body = [];
    currentSection.body.push(seg);
  }

  for (const block of blocks) {
    const type = block.type;
    const blockData = block[type] || {};
    const text = richTextToPlain(blockData.rich_text);

    // Skip empty blocks
    if (type === "paragraph" && !text.trim()) {
      // Empty paragraph = paragraph gap (add \n\n to current text segment if exists)
      if (currentSection?.body?.length > 0) {
        const last = currentSection.body[currentSection.body.length - 1];
        if (last.type === "text") last.content += "\n\n";
      }
      continue;
    }

    if (type === "divider") {
      flushSection();
      continue;
    }

    if (type === "heading_1") {
      // First heading_1 → cover title
      if (!coverTitleSet) {
        cover.title = text;
        coverTitleSet = true;
        continue;
      }
      // Subsequent heading_1 → new section headline
      flushSection();
      currentSection = { headline: text };
      continue;
    }

    if (type === "heading_2" || type === "heading_3") {
      flushSection();
      currentSection = { headline: text };
      continue;
    }

    if (type === "paragraph") {
      // First paragraph after cover title → cover subtitle
      if (coverTitleSet && !coverSubtitleSet && sections.length === 0 && !currentSection) {
        cover.subtitle = text;
        coverSubtitleSet = true;
        continue;
      }
      ensureSection();
      appendTextSegment(text);
      continue;
    }

    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      const prefix = type === "numbered_list_item" ? "• " : "· ";
      ensureSection();
      // Accumulate list items into a list segment
      const segments = currentSection.body || [];
      const last = segments[segments.length - 1];
      if (last && last.type === "list") {
        last.content += "\n" + prefix + text;
      } else {
        appendSegment({ type: "list", content: prefix + text });
      }
      continue;
    }

    if (type === "image") {
      const imgUrl = getImageUrl(block);
      if (imgUrl) {
        // Download image
        imageCount++;
        const ext = imgUrl.includes(".png") ? "png" : "jpg";
        const fileName = `${pageId.replace(/-/g,"").slice(0,8)}-${imageCount}.${ext}`;
        const destPath = path.join(screenshotsDir, fileName);
        try {
          await downloadFile(imgUrl, destPath);
          console.error(`  Downloaded image → ${destPath}`);
          // Start new section for this image (images always get own slide)
          flushSection();
          currentSection = { image: `./screenshots/${fileName}`, imageAspect: "16/9", imagePosition: "top" };
        } catch (e) {
          console.error(`  Failed to download image: ${e.message}`);
        }
      }
      continue;
    }

    if (type === "quote") {
      ensureSection();
      appendTextSegment(`「${text}」`);
      continue;
    }

    if (type === "callout") {
      ensureSection();
      const icon = block.callout?.icon;
      const emoji = icon?.type === "emoji" ? icon.emoji : "💡";
      appendSegment({ type: "callout", content: text, emoji });
      // Also parse children of callout (if any)
      if (block.has_children) {
        block._calloutParent = true;
      }
      continue;
    }

    if (type === "code") {
      ensureSection();
      const lang = block.code?.language || "";
      const codeText = richTextToPlain(block.code?.rich_text);
      const seg = { type: "code", content: codeText };
      if (lang && lang !== "plain text") seg.lang = lang;
      appendSegment(seg);
      continue;
    }

    if (type === "toggle") {
      ensureSection();
      appendTextSegment("▸ " + text);
      continue;
    }

    if (type === "to_do") {
      const checked = block.to_do?.checked ? "☑" : "☐";
      ensureSection();
      // Accumulate to_do items into a list segment
      const segments = currentSection.body || [];
      const last = segments[segments.length - 1];
      if (last && last.type === "list") {
        last.content += "\n" + `${checked} ${text}`;
      } else {
        appendSegment({ type: "list", content: `${checked} ${text}` });
      }
      continue;
    }

    if (type === "column_list") {
      // Fetch children (columns), then fetch each column's children (blocks)
      // Flatten left→right into body
      if (block.has_children) {
        try {
          const columns = await fetchAllBlocks(block.id, key);
          const columnTexts = [];
          for (const col of columns) {
            if (col.type !== "column") continue;
            const colBlocks = await fetchAllBlocks(col.id, key);
            const colText = colBlocks
              .filter(b => b[b.type]?.rich_text)
              .map(b => richTextToPlain(b[b.type].rich_text))
              .filter(Boolean)
              .join("\n");
            if (colText) columnTexts.push(colText);
          }
          if (columnTexts.length > 0) {
            ensureSection();
            appendTextSegment(columnTexts.join(" · "));
          }
        } catch (e) {
          console.error(`  Failed to parse column_list: ${e.message}`);
        }
      }
      continue;
    }

    // Fallback: any block with rich_text → body
    if (blockData.rich_text && text) {
      ensureSection();
      appendTextSegment(text);
    }
  }

  flushSection();

  // Heuristic: if last section has no headline and body is short → use as CTA
  if (sections.length > 0) {
    const last = sections[sections.length - 1];
    if (!last.headline && !last.image && last.body) {
      // Flatten segments to check total text length
      const totalText = last.body.map(s => s.content).join("");
      if (totalText.length < 60) {
        cta = totalText;
        sections.pop();
      }
    }
  }

  // Fallback cover title from page title if not set
  if (!cover.title && pageTitle) cover.title = pageTitle;
  if (!cta) cta = "关注我，获取更多 AI 效率技巧";

  return { cover, sections, cta };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const pageId = args.find(a => !a.startsWith("--"));
  if (!pageId) {
    console.error("Usage: node notion-to-content.js <page-id> [--output content.json] [--theme '{...}']");
    process.exit(1);
  }

  const outputIdx = args.indexOf("--output");
  const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : "content-from-notion.json";

  const themeIdx = args.indexOf("--theme");
  const themeOverride = themeIdx !== -1 ? JSON.parse(args[themeIdx + 1]) : {};

  const key = getNotionKey();
  if (!key) {
    console.error("No Notion API key found. Set NOTION_KEY or configure skills.entries.notion.apiKey in openclaw.json");
    process.exit(1);
  }

  const screenshotsDir = path.resolve("./screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });

  console.error(`Fetching Notion page: ${pageId}`);
  const { cover, sections, cta } = await parseNotion(pageId, key, screenshotsDir);

  const defaultTheme = {
    palette: "paper",
    spacing: "md",
    fontFamily: "sans",
    pattern: "paper",
    patternOpacity: 0.16,
    patternBlend: "multiply",
    patternSpacing: 48,
    patternMask: "none",
    codeFontSize: 30,
    codeLineHeight: 48,
    codePadTop: 10,
    codePadBottom: 6,
    codePadLeft: 14,
    codePadRight: 14,
  };

  const content = {
    theme: { ...defaultTheme, ...themeOverride },
    cover,
    sections,
    cta,
  };

  fs.writeFileSync(outputFile, JSON.stringify(content, null, 2), "utf-8");
  console.log(`Written → ${outputFile}`);
  console.log(`  Cover: "${cover.title}"`);
  console.log(`  Sections: ${sections.length}`);
  console.log(`  Images: ${sections.filter(s => s.image).length}`);
}

main();
