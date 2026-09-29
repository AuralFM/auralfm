import type { ToolcraftImageAsset, ToolcraftMediaAsset, ToolcraftSceneRect } from "@/toolcraft/runtime";
import { getToolcraftSceneElementRect } from "@/toolcraft/runtime";

import { risoSourceTarget } from "./riso-params";

/** Longest edge of the prepared source texture; larger photos are resampled once. */
export const risoMaxSourceEdge = 4096;

type ImageAssetLike = Readonly<Pick<ToolcraftImageAsset, "id" | "size" | "sourceSize" | "transform">> & {
  readonly resourceRef?: unknown;
};

export function getRisoSourceAsset(state: { readonly mediaAssets: readonly ToolcraftMediaAsset[] }): ToolcraftImageAsset | null {
  for (const asset of state.mediaAssets) {
    if (asset.assetKind === "image" && asset.sourceTarget === risoSourceTarget && asset.lifecycle !== "unavailable") {
      return asset;
    }
  }
  return null;
}

export function getRisoSceneRect(state: { readonly mediaAssets: readonly ToolcraftMediaAsset[] }): ToolcraftSceneRect | null {
  const asset = getRisoSourceAsset(state);
  return asset ? getToolcraftSceneElementRect(asset) : null;
}

/** Identity of the prepared source pixels: bytes, crop and orientation. */
export function getRisoSourceKey(asset: ImageAssetLike): string {
  const transform = asset.transform;
  return JSON.stringify([
    asset.id,
    asset.resourceRef ?? null,
    asset.size.width,
    asset.size.height,
    transform?.rotationDeg ?? 0,
    transform?.flipHorizontal ?? false,
    transform?.flipVertical ?? false,
  ]);
}

function isQuarterTurn(rotationDeg: number | undefined): boolean {
  return Math.abs((((rotationDeg ?? 0) % 180) + 180) % 180) === 90;
}

export function getRisoSourcePixelSize(asset: ImageAssetLike): { width: number; height: number } {
  // Keep the source's own sampling density across the cover crop, capped for GPU memory.
  const rotated = isQuarterTurn(asset.transform?.rotationDeg);
  const sourceWidth = rotated ? asset.sourceSize.height : asset.sourceSize.width;
  const sourceHeight = rotated ? asset.sourceSize.width : asset.sourceSize.height;
  const density = Math.max(sourceWidth / asset.size.width, sourceHeight / asset.size.height);
  const width = Math.max(1, asset.size.width * density);
  const height = Math.max(1, asset.size.height * density);
  const scale = Math.min(1, risoMaxSourceEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Prepared source pixels: RGBA rows top to bottom, not premultiplied. */
export type RisoPixels = Readonly<{ width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }>;

/**
 * Draws the uploaded image into the asset's scene frame as a cover crop with
 * the runtime's rotation and flips applied, so the riso pass samples the
 * composition the user placed.
 */
export function prepareRisoSource(image: ImageBitmap, asset: ImageAssetLike): RisoPixels {
  const { width, height } = getRisoSourcePixelSize(asset);
  const surface = new OffscreenCanvas(width, height);
  const context = surface.getContext("2d");
  if (!context) throw new Error("Riso Slicer needs a 2D canvas to prepare the source image.");
  const rotation = asset.transform?.rotationDeg ?? 0;
  const rotated = isQuarterTurn(rotation);
  // Frame dimensions in the image's own orientation, before rotation.
  const frameWidth = rotated ? height : width;
  const frameHeight = rotated ? width : height;
  const sourceAspect = image.width / image.height;
  const frameAspect = frameWidth / frameHeight;
  const cropWidth = sourceAspect > frameAspect ? image.height * frameAspect : image.width;
  const cropHeight = sourceAspect > frameAspect ? image.height : image.width / frameAspect;
  context.imageSmoothingQuality = "high";
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(asset.transform?.flipHorizontal ? -1 : 1, asset.transform?.flipVertical ? -1 : 1);
  context.drawImage(image, (image.width - cropWidth) / 2, (image.height - cropHeight) / 2, cropWidth, cropHeight, -frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight);
  // Copy into a plain array owned by the product so no canvas-backed buffer outlives this call.
  const data = new Uint8ClampedArray(width * height * 4);
  data.set(context.getImageData(0, 0, width, height).data);
  return { width, height, data };
}

/**
 * Fetches, decodes and prepares the uploaded image. Only plain pixels leave
 * this chain; the decoded bitmap is closed inside it.
 */
export function loadRisoSource(url: string, asset: ImageAssetLike, signal: AbortSignal): Promise<RisoPixels> {
  return fetch(url, { signal })
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      try {
        signal.throwIfAborted();
        return prepareRisoSource(bitmap, asset);
      } finally {
        bitmap.close();
      }
    });
}
