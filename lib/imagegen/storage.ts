import type { ImageBytes } from "./types";

/**
 * Where finished images are persisted. The gateway never hands the
 * frontend a provider URL: the backend downloads every result and passes
 * it to the storage adapter, which returns the URL the app will use.
 *
 * This app's storage is the visitor's own browser (IndexedDB, 7-day
 * expiry, by design — nothing about users is kept server-side). So the
 * default adapter returns the bytes inline as a data: URL and the client
 * saves them into that store. A deployment with S3/R2 swaps in an adapter
 * that uploads and returns a permanent HTTPS URL; nothing else changes.
 */
export interface ImageStorage {
  store(image: ImageBytes, meta: { generationKey: string; provider: string }): Promise<{ url: string }>;
}

export class InlineImageStorage implements ImageStorage {
  async store(image: ImageBytes): Promise<{ url: string }> {
    return { url: `data:${image.mime};base64,${Buffer.from(image.data).toString("base64")}` };
  }
}
