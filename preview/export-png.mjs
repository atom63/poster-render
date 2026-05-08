#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildPreviewDocument, loadPreviewContent } from './preview.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_SIZE = { width: 1080, height: 1350 };

function usage() {
  console.error('Usage: node preview/export-png.mjs [content.json] [--output output-dir]');
}

function parseArgs(argv) {
  const args = { input: null, output: 'preview-export', help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '--output') {
      const next = argv[++i];
      if (!next || next.startsWith('-')) throw new Error('--output requires a directory path');
      args.output = next;
    } else if (!arg.startsWith('-') && !args.input) {
      args.input = arg;
    } else if (!arg.startsWith('-')) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

async function waitForAssets(page) {
  await page.evaluate(async () => {
    await (document.fonts?.ready ?? Promise.resolve());
    await Promise.all(
      [...document.images].map((img) => {
        if (img.complete) return null;
        return new Promise((resolve, reject) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', reject, { once: true });
        });
      }).filter(Boolean),
    );
  });
}

export async function exportPreviewPng(content, { sourcePath = null, outputDir = 'preview-export', cssText = '' } = {}) {
  const resolvedCssText = cssText || fs.readFileSync(path.resolve(MODULE_DIR, 'preview.css'), 'utf8');
  const html = await buildPreviewDocument(content, { sourcePath, cssText: resolvedCssText });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-render-preview-export-'));
  const htmlPath = path.join(tempDir, 'preview.html');
  fs.writeFileSync(htmlPath, html);

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: EXPORT_SIZE,
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await waitForAssets(page);
      const slides = page.locator('.slide');
      const count = await slides.count();
      const outputPaths = [];
      for (let i = 0; i < count; i++) {
        const fileName = `slide-${String(i + 1).padStart(2, '0')}.png`;
        const filePath = path.join(outputDir, fileName);
        await slides.nth(i).screenshot({ path: filePath });
        outputPaths.push(filePath);
      }
      return outputPaths;
    } finally {
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const inputPath = args.input ? path.resolve(args.input) : path.resolve(MODULE_DIR, '../examples/sample-content.json');
  const outputDir = path.resolve(args.output);
  const { content, inputPath: resolvedInput } = loadPreviewContent(inputPath);
  const cssPath = path.resolve(MODULE_DIR, 'preview.css');
  const cssText = fs.readFileSync(cssPath, 'utf8');
  const files = await exportPreviewPng(content, { sourcePath: resolvedInput, outputDir, cssText });
  console.error(`[preview-export] wrote ${files.length} PNG files to ${outputDir}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    console.error(`[preview-export] ${err?.stack || err?.message || err}`);
    process.exit(1);
  });
}
