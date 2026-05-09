import path from "path";
import { loadImage } from "canvas";

// Returns null if path missing or fails.
// aspectRatio: "16/9" | "4/3" | "1/1" | "free" (default)
// imagePosition: "top" | "center" | "bottom" (default "top")
// When set, image is cropped to that ratio at the given vertical position.
export async function loadSectionImage(imagePath, contentWidth, maxH = 700, aspectRatio = "free", imagePosition = "top") {
  if (!imagePath) return null;
  try {
    const resolved = path.isAbsolute(imagePath) ? imagePath : path.resolve(imagePath);
    const img = await loadImage(resolved);

    // Compute crop region based on aspect ratio
    let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
    if (aspectRatio !== "free") {
      const [rw, rh] = aspectRatio.split("/").map(Number);
      const targetRatio = rw / rh;
      const imgRatio = img.width / img.height;
      if (imgRatio > targetRatio) {
        // Too wide — crop sides (always center horizontally)
        srcW = Math.round(img.height * targetRatio);
        srcX = Math.round((img.width - srcW) / 2);
      } else {
        // Too tall — crop vertically by position
        srcH = Math.round(img.width / targetRatio);
        if (imagePosition === "center") {
          srcY = Math.round((img.height - srcH) / 2);
        } else if (imagePosition === "bottom") {
          srcY = img.height - srcH;
        } else {
          srcY = 0; // top
        }
      }
    }

    // Scale cropped region to contentWidth
    let scale = contentWidth / srcW;
    let drawW = contentWidth;
    let drawH = Math.round(srcH * scale);

    // Cap height
    if (drawH > maxH) {
      scale = maxH / srcH;
      drawH = maxH;
      drawW = Math.round(srcW * scale);
    }

    return { img, srcX, srcY, srcW, srcH, drawW, drawH };
  } catch (e) {
    console.error(`[poster-render] Could not load image: ${imagePath} — ${e.message}`);
    return null;
  }
}
