import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { dataDir, safeResourcePath } from "./storage";
import type { StoredResource } from "./types";

const thumbnailDir = path.join(dataDir, "runtime", "thumbnails");
const pendingThumbnails = new Map<string, Promise<string>>();

export function thumbnailSize(value: unknown): 64 | 256 | 512 | 1024 {
  const requested = Number(value);
  if (requested <= 64) return 64;
  if (requested <= 256) return 256;
  if (requested <= 512) return 512;
  return 1024;
}

export async function resourceThumbnail(resource: StoredResource, size: 64 | 256 | 512 | 1024) {
  const key = `${resource.id}-${size}`;
  const existing = pendingThumbnails.get(key);
  if (existing) return existing;
  const promise = createResourceThumbnail(resource, size).finally(() => pendingThumbnails.delete(key));
  pendingThumbnails.set(key, promise);
  return promise;
}

async function createResourceThumbnail(resource: StoredResource, size: number) {
  await mkdir(thumbnailDir, { recursive: true });
  const cacheId = createHash("sha256").update(`${resource.id}:${size}`).digest("hex").slice(0, 32);
  const target = path.join(thumbnailDir, `${cacheId}.webp`);
  try {
    await sharp(target).metadata();
    return target;
  } catch {
    // Missing or incomplete derived cache entries are rebuilt from the canonical resource.
  }
  const temporary = path.join(thumbnailDir, `.${cacheId}-${process.pid}-${Date.now()}.webp`);
  await sharp(safeResourcePath(resource.fileName))
    .rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 3 })
    .toFile(temporary);
  await rename(temporary, target).catch(async () => {
    // A concurrent process may have completed the same immutable thumbnail first.
    await sharp(target).metadata();
  });
  return target;
}
