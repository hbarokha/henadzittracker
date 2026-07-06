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

/**
 * Atomic read-modify-write with optimistic concurrency.
 *
 * Plain writeJson() is last-writer-wins: two concurrent read-modify-write cycles on the
 * same blob silently drop one of the writes (this has caused real data loss on
 * supplements.json). mutateJson() closes that hole in blob mode by uploading with an
 * ETag `ifMatch` condition and retrying the whole read+mutate cycle on a 412/409.
 *
 * `fn` mutates `data` in place and returns { write, result }:
 *   write:false → nothing is persisted (pure-read fast path stays cheap)
 *   write:true  → conditional upload; on conflict the mutation is re-run on fresh data
 * When the blob doesn't exist yet, `fallback` seeds the data and the upload is
 * conditioned on ifNoneMatch:"*" so two concurrent creators can't clobber each other.
 */
export async function mutateJson<T, R = void>(
  name: string,
  fallback: T,
  fn: (data: T) => { write: boolean; result?: R } | Promise<{ write: boolean; result?: R }>,
): Promise<R | undefined> {
  if (USE_BLOB) {
    const blob = container().getBlockBlobClient(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      let data: T;
      let etag: string | null = null;
      try {
        // getProperties → downloadToBuffer can race a concurrent write, but the stale
        // etag then fails the conditional upload and we retry — still safe.
        etag = (await blob.getProperties()).etag ?? null;
        const buf: Buffer = await blob.downloadToBuffer();
        data = JSON.parse(buf.toString("utf-8")) as T;
      } catch {
        data = structuredClone(fallback);
        etag = null;
      }
      const { write, result } = await fn(data);
      if (!write) return result;
      const buf = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
      try {
        await blob.upload(buf, buf.length, {
          blobHTTPHeaders: { blobContentType: "application/json" },
          conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" },
        });
        return result;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 412 || status === 409) continue; // concurrent write — re-read and retry
        throw e;
      }
    }
    throw new Error(`mutateJson: concurrent-write retries exhausted for ${name}`);
  }

  // Local fs mode — single process, no concurrency concern.
  const p = localPath(name);
  let data: T;
  try {
    data = fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf-8")) as T) : structuredClone(fallback);
  } catch {
    data = structuredClone(fallback);
  }
  const { write, result } = await fn(data);
  if (write) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  }
  return result;
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
