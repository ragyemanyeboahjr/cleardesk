import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Local-disk storage driver. Swap this module for S3 / R2 / GCS when hosting:
// callers only use putFile / readFile with an opaque key.

const ROOT = path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage");

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function resolveKey(key: string): string {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export async function putFile(clientId: string, ext: string, bytes: Uint8Array): Promise<string> {
  const safeClient = clientId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeExt = ext.replace(/[^a-z0-9]/g, "");
  const key = `uploads/${safeClient}/${crypto.randomUUID()}.${safeExt}`;
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}
