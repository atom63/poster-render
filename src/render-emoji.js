import { loadImage } from "canvas";
import fs from "fs";
import path from "path";

// --- Twemoji PNG rendering for emoji (node-canvas/Cairo can't render color emoji) ---
export const EMOJI_CACHE_DIR = path.resolve("emoji-cache");

// Regex to detect emoji characters (covers most common emoji ranges)
export const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;

export function isEmoji(str) {
  return EMOJI_RE.test(str);
}

export function emojiToCDNUrl(emoji) {
  const codepoints = [...emoji]
    .map(c => c.codePointAt(0).toString(16))
    .filter(cp => cp !== "fe0f")
    .join("-");
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoints}.png`;
}

// ASCII fallback mapping for when emoji download fails
export const EMOJI_ASCII_FALLBACK = {
  "💡": "»", "⚠️": "!", "❗": "!", "‼️": "!!",
  "✅": "✓", "❌": "✗", "🔥": "▲", "📌": "•",
  "📝": "#", "🚀": ">", "💬": ">", "🔑": "*",
  "ℹ️": "i", "⛔": "×", "🛑": "×", "👉": "→",
  "✨": "*", "🎯": "○", "📎": "·", "🔗": "@",
};

export const _emojiImageCache = {};

export async function loadEmojiImage(emoji) {
  if (_emojiImageCache[emoji]) return _emojiImageCache[emoji];
  if (!fs.existsSync(EMOJI_CACHE_DIR)) fs.mkdirSync(EMOJI_CACHE_DIR, { recursive: true });

  const codepoints = [...emoji]
    .map(c => c.codePointAt(0).toString(16))
    .filter(cp => cp !== "fe0f")
    .join("-");
  const cachePath = path.join(EMOJI_CACHE_DIR, `${codepoints}.png`);

  if (!fs.existsSync(cachePath)) {
    const url = emojiToCDNUrl(emoji);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(cachePath, buf);
    } catch (e) {
      console.warn(`Failed to download emoji ${emoji}: ${e.message}`);
      return null;
    }
  }

  try {
    const img = await loadImage(cachePath);
    _emojiImageCache[emoji] = img;
    return img;
  } catch {
    return null;
  }
}
