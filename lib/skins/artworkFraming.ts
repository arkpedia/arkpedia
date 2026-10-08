import type { View } from './dynamicArt';

/** Normalised visible pixels; bottom-up for both WebGL and the still-image reference. */
export interface ArtworkBox { x: number; y: number; width: number; height: number }
export function alphaBox(pixels: ArrayLike<number>, width: number, height: number, bottomUp = false): ArtworkBox | null {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 16) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left / width, y: bottomUp ? top / height : 1 - (bottom + 1) / height,
    width: (right - left + 1) / width, height: (bottom - top + 1) / height };
}

/** Convert the measured visible artwork back into world coordinates. */
export function visibleWorldBox(view: View, aspect: number, pixels: ArtworkBox): ArtworkBox {
  return { x: view.x + (pixels.x - 0.5) * view.height * aspect,
    y: view.y + (pixels.y - 0.5) * view.height, width: pixels.width * view.height * aspect, height: pixels.height * view.height };
}

/** Put the artwork into the still image's visible box, including its transparent margins.
 * Both views share the image element and its CSS zoom/pan; this camera is fixed after calibration. */
export function posterView(artwork: ArtworkBox, poster: ArtworkBox, aspect: number): View {
  const height = Math.max(artwork.height / poster.height, artwork.width / (poster.width * aspect));
  return { x: artwork.x + artwork.width / 2 - (poster.x + poster.width / 2 - 0.5) * height * aspect,
    y: artwork.y + artwork.height / 2 - (poster.y + poster.height / 2 - 0.5) * height, height, roll: 0 };
}
