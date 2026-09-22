"use client";

/**
 * Image handling, all in the browser. The only time a photo leaves the
 * device is the explicit "Dress me" request, and then only a downscaled
 * copy.
 */

export async function toBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

/** Longest side ≤ max, re-encoded. EXIF (incl. location) is dropped by the re-encode. */
export async function downscale(blob: Blob, max: number, type = "image/jpeg", quality = 0.88): Promise<Blob> {
  const bmp = await toBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas.convertToBlob({ type, quality });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

// ── cut-out ─────────────────────────────────────────────────────────────

const MP_VERSION = "1.0.1";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

type Segmenter = import("@mediapipe/tasks-vision").ImageSegmenter;
let segmenter: Promise<Segmenter> | undefined;

function loadSegmenter(): Promise<Segmenter> {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  })();
  return segmenter;
}

/**
 * The person without the background, as a transparent PNG cropped to the
 * subject. Uses MediaPipe's multiclass selfie model, which keeps hair,
 * which is where simpler models fail. Edges are feathered by upscaling
 * the soft confidence mask rather than thresholding it.
 */
export async function cutout(blob: Blob): Promise<Blob> {
  const seg = await loadSegmenter();
  const bmp = await toBitmap(await downscale(blob, 1400, "image/png"));
  const { width: w, height: h } = bmp;
  const src = new OffscreenCanvas(w, h);
  const sctx = src.getContext("2d")!;
  sctx.drawImage(bmp, 0, 0);
  const result = seg.segment(bmp);
  const bg = result.confidenceMasks?.[0]; // category 0 = background
  if (!bg) throw new Error("Couldn't find a person in this photo.");
  const mw = bg.width;
  const mh = bg.height;
  const conf = bg.getAsFloat32Array();

  // mask canvas at model resolution, then drawn scaled (bilinear = feathering)
  const m = new OffscreenCanvas(mw, mh);
  const mctx = m.getContext("2d")!;
  const md = mctx.createImageData(mw, mh);
  let minX = mw, minY = mh, maxX = 0, maxY = 0;
  for (let i = 0; i < conf.length; i++) {
    const a = Math.max(0, Math.min(1, (1 - conf[i] - 0.15) / 0.7));
    md.data[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.5) {
      const x = i % mw, y = (i / mw) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  result.close();
  if (maxX <= minX || maxY <= minY) throw new Error("Couldn't find a person in this photo.");
  mctx.putImageData(md, 0, 0);

  const out = new OffscreenCanvas(w, h);
  const octx = out.getContext("2d")!;
  octx.drawImage(src, 0, 0);
  octx.globalCompositeOperation = "destination-in";
  octx.imageSmoothingQuality = "high";
  octx.drawImage(m, 0, 0, w, h);
  bmp.close();

  // crop to the subject with breathing room; keep the bottom edge (shoulders)
  const sx = w / mw, sy = h / mh;
  const pad = 0.06 * Math.max(w, h);
  const x0 = Math.max(0, Math.floor(minX * sx - pad));
  const y0 = Math.max(0, Math.floor(minY * sy - pad));
  const x1 = Math.min(w, Math.ceil(maxX * sx + pad));
  const y1 = h;
  const crop = new OffscreenCanvas(x1 - x0, y1 - y0);
  crop.getContext("2d")!.drawImage(out, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  return crop.convertToBlob({ type: "image/png" });
}
