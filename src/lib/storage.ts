/**
 * Dual-mode storage abstraction.
 *
 * Local dev  (no AZURE_STORAGE_CONNECTION_STRING):
 *   reads/writes files under <cwd>/data/
 *
 * Azure SWA  (AZURE_STORAGE_CONNECTION_STRING set):
 *   reads/writes blobs in the configured container.
 *   Blob names mirror the relative paths used locally
 *   (e.g. "log.json", "garmin-cache/2026-06-14-sleep.json").
 */

import fs from "fs";
import path from "path";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const CONTAINER_NAME    = process.env.AZURE_STORAGE_CONTAINER   ?? "henadzittracker";
const USE_BLOB          = CONNECTION_STRING.length > 0;

const LOCAL_DATA_DIR = path.join(process.cwd(), "data");

// ── Blob client (lazy) ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _container: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function container(): any {
  if (!_container) {
    // Dynamic require so the import is tree-shaken in local mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BlobServiceClient } = require("@azure/storage-blob");
    _container = BlobServiceClient
      .fromConnectionString(CONNECTION_STRING)
      .getContainerClient(CONTAINER_NAME);
  }
  return _container;
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function localPath(name: string) {
  return path.join(LOCAL_DATA_DIR, name);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function readJson<T>(name: string): Promise<T | null> {
  if (USE_BLOB) {
    try {
      const buf: Buffer = await container().getBlobClient(name).downloadToBuffer();
      return JSON.parse(buf.toString("utf-8")) as T;
    } catch { return null; }
  }
  const p = localPath(name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T; } catch { return null; }
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  if (USE_BLOB) {
    const buf = Buffer.from(content, "utf-8");
    await container()
      .getBlockBlobClient(name)
      .upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: "application/json" } });
    return;
  }
  const p = localPath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

export async function readText(name: string): Promise<string | null> {
  if (USE_BLOB) {
    try {
      const buf: Buffer = await container().getBlobClient(name).downloadToBuffer();
      return buf.toString("utf-8");
    } catch { return null; }
  }
  const p = localPath(name);
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, "utf-8"); } catch { return null; }
}

export async function writeText(name: string, content: string): Promise<void> {
  if (USE_BLOB) {
    const buf = Buffer.from(content, "utf-8");
    await container()
      .getBlockBlobClient(name)
      .upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: "text/plain" } });
    return;
  }
  const p = localPath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

export async function blobExists(name: string): Promise<boolean> {
  if (USE_BLOB) {
    try { return await container().getBlobClient(name).exists(); } catch { return false; }
  }
  return fs.existsSync(localPath(name));
}

export async function deleteBlob(name: string): Promise<void> {
  if (USE_BLOB) {
    try { await container().getBlobClient(name).deleteIfExists(); } catch {}
    return;
  }
  const p = localPath(name);
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}
