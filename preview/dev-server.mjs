#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreviewDocument, loadPreviewContent } from './preview.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { input: null, template: null, port: 3456 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--template') {
      args.template = argv[++i];
    } else if (arg === '--port') {
      args.port = Number(argv[++i]);
    } else if (!arg.startsWith('-') && !args.input) {
      args.input = arg;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input
  ? path.resolve(args.input)
  : path.resolve(MODULE_DIR, '../examples/sample-content.json');
const cssPath = path.resolve(MODULE_DIR, 'preview.css');

// SSE clients waiting for reload signal
const clients = new Set();

async function buildHtml() {
  const cssText = fs.readFileSync(cssPath, 'utf8');
  const { content, inputPath: resolvedInput } = loadPreviewContent(inputPath);
  const html = await buildPreviewDocument(content, {
    sourcePath: resolvedInput,
    cssText,
    template: args.template,
  });
  // Inject SSE live-reload listener
  return html.replace(
    '</body>',
    `<script>
  const es = new EventSource('/__reload');
  es.onmessage = () => location.reload();
</script>
</body>`,
  );
}

// Watch input file and template CSS for changes
const watched = new Set([inputPath, cssPath]);
if (args.template) {
  watched.add(path.resolve(MODULE_DIR, 'templates', `${args.template}.css`));
}
for (const f of watched) {
  if (fs.existsSync(f)) {
    fs.watch(f, () => {
      console.error(`[dev] changed: ${path.basename(f)}`);
      for (const res of clients) {
        res.write('data: reload\n\n');
      }
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(':\n\n'); // keep-alive comment
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  try {
    const html = await buildHtml();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(e.message);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[dev] port ${args.port} is already in use — kill the old process with:\n  lsof -ti:${args.port} | xargs kill`);
  } else {
    console.error(`[dev] server error: ${e.message}`);
  }
  process.exit(1);
});

server.listen(args.port, () => {
  const templateLabel = args.template ? ` --template ${args.template}` : '';
  console.error(`[dev] http://localhost:${args.port}${templateLabel}`);
  console.error(`[dev] watching ${path.basename(inputPath)} for changes`);
});
