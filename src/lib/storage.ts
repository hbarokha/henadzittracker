/**
 * Multi-backend storage abstraction. Every caller uses the same name-keyed API
 * ("log.json", "garmin-cache/2026-06-14-sleep.json"); the backend is picked by env:
 *
 *   COSMOS_CONNECTION_STRING set          → Azure Cosmos DB (one document per name)
 *   AZURE_STORAGE_CONNECTION_STRING set   → Azure Blob Storage (legacy / migration source)
 *   neither                               → files under <cwd>/data/
 *
 * Cosmos wins when both are set, so the blob string can stay configured while migrating.
 */

import fs from "fs";
import path from "path";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const CONTAINER_NAME    = process.env.AZURE_STORAGE_CONTAINER   ?? "henadzittracker";
const COSMOS_CONNECTION = process.env.COSMOS_CONNECTION_STRING ?? "";
const COSMOS_DATABASE   = process.env.COSMOS_DATABASE  ?? "henadzittracker";
const COSMOS_CONTAINER  = process.env.COSMOS_CONTAINER ?? "docs";
const USE_COSMOS        = COSMOS_CONNECTION.length > 0;
const USE_BLOB          = !USE_COSMOS && CONNECTION_STRING.length > 0;

// Cosmos caps an item at 2 MB; leave headroom for the envelope and system fields.
const COSMOS_MAX_BYTES = 1_900_000;

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

// ── Cosmos client (lazy) ──────────────────────────────────────────────────────

/**
 * One document per storage name. `id` is the name with "/" swapped for "|" (ids may not
 * contain slashes); the partition key is the first path segment, so a whole cache folder
 * ("garmin-cache") shares a partition and a point read is a single-partition lookup.
 * JSON payloads live under `data`, text payloads under `text`.
 */
interface CosmosDoc {
  id: string;
  pk: string;
  data?: unknown;
  text?: string;
  _etag?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cosmos: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cosmos(): Promise<any> {
  if (!_cosmos) {
    _cosmos = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CosmosClient } = require("@azure/cosmos");
      const client = new CosmosClient(COSMOS_CONNECTION);
      const { database } = await client.databases.createIfNotExists({ id: COSMOS_DATABASE });
      const { container } = await database.containers.createIfNotExists({
        id: COSMOS_CONTAINER,
        partitionKey: { paths: ["/pk"] },
      });
      return container;
    })();
    _cosmos.catch(() => { _cosmos = null; }); // a failed bootstrap must not poison later calls
  }
  return _cosmos;
}

function cosmosKey(name: string) {
  return { id: name.replace(/\//g, "|"), pk: name.split("/")[0] };
}

async function cosmosRead(name: string): Promise<CosmosDoc | null> {
  const { id, pk } = cosmosKey(name);
  const { resource } = await (await cosmos()).item(id, pk).read();
  return (resource as CosmosDoc | undefined) ?? null;
}

function cosmosEnvelope(name: string, body: { data?: unknown; text?: string }): CosmosDoc {
  const doc = { ...cosmosKey(name), ...body };
  if (Buffer.byteLength(JSON.stringify(doc), "utf-8") > COSMOS_MAX_BYTES) {
    throw new Error(`storage: ${name} exceeds the Cosmos 2 MB item limit`);
  }
  return doc;
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function localPath(name: string) {
  return path.join(LOCAL_DATA_DIR, name);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function readJson<T>(name: string): Promise<T | null> {
  if (USE_COSMOS) {
    try { return ((await cosmosRead(name))?.data as T | undefined) ?? null; } catch { return null; }
  }
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
  if (USE_COSMOS) {
    await (await cosmos()).items.upsert(cosmosEnvelope(name, { data }));
    return;
  }
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
  if (USE_COSMOS) {
    const c = await cosmos();
    const { id, pk } = cosmosKey(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      // One round trip: the read returns the document and its etag together.
      const existing = await cosmosRead(name);
      const data: T = existing?.data !== undefined ? (existing.data as T) : structuredClone(fallback);
      const { write, result } = await fn(data);
      if (!write) return result;
      const doc = cosmosEnvelope(name, { data });
      try {
        if (existing?._etag) {
          await c.item(id, pk).replace(doc, { accessCondition: { type: "IfMatch", condition: existing._etag } });
        } else {
          await c.items.create(doc); // 409 if a concurrent creator got there first
        }
        return result;
      } catch (e) {
        const status = (e as { code?: number; statusCode?: number })?.code ?? (e as { statusCode?: number })?.statusCode;
        if (status === 412 || status === 409 || status === 404) continue; // concurrent write — re-read and retry
        throw e;
      }
    }
    throw new Error(`mutateJson: concurrent-write retries exhausted for ${name}`);
  }

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
  if (USE_COSMOS) {
    try { return (await cosmosRead(name))?.text ?? null; } catch { return null; }
  }
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
  if (USE_COSMOS) {
    await (await cosmos()).items.upsert(cosmosEnvelope(name, { text: content }));
    return;
  }
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
  if (USE_COSMOS) {
    try { return (await cosmosRead(name)) !== null; } catch { return false; }
  }
  if (USE_BLOB) {
    try { return await container().getBlobClient(name).exists(); } catch { return false; }
  }
  return fs.existsSync(localPath(name));
}

export async function deleteBlob(name: string): Promise<void> {
  if (USE_COSMOS) {
    const { id, pk } = cosmosKey(name);
    try { await (await cosmos()).item(id, pk).delete(); } catch {}
    return;
  }
  if (USE_BLOB) {
    try { await container().getBlobClient(name).deleteIfExists(); } catch {}
    return;
  }
  const p = localPath(name);
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
}

// ── Bulk helpers ──────────────────────────────────────────────────────────────

/**
 * Read many documents at once; the result lines up with `names` (null = missing).
 * On Cosmos this is one query per partition (per 100 names) rather than one round trip
 * per document, which is what makes per-day documents cheap to read as a range.
 */
export async function readManyJson<T>(names: string[]): Promise<(T | null)[]> {
  if (!USE_COSMOS) return Promise.all(names.map((n) => readJson<T>(n)));

  const found = new Map<string, unknown>();
  const byPk = new Map<string, string[]>();
  for (const n of names) {
    const { id, pk } = cosmosKey(n);
    (byPk.get(pk) ?? byPk.set(pk, []).get(pk)!).push(id);
  }
  const c = await cosmos();
  await Promise.all([...byPk].flatMap(([pk, ids]) =>
    Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100)).map(async (chunk) => {
      const { resources } = await c.items
        .query({ query: "SELECT c.id, c.data FROM c WHERE c.pk = @pk AND ARRAY_CONTAINS(@ids, c.id)",
                 parameters: [{ name: "@pk", value: pk }, { name: "@ids", value: chunk }] },
               { partitionKey: pk })
        .fetchAll();
      for (const r of resources as { id: string; data?: unknown }[]) found.set(r.id, r.data);
    })));
  return names.map((n) => (found.get(cosmosKey(n).id) as T | undefined) ?? null);
}

/** Names of every document under `prefix/` (e.g. "food-log" → "food-log/2026-10-24.json"). */
export async function listNames(prefix: string): Promise<string[]> {
  if (USE_COSMOS) {
    const { resources } = await (await cosmos()).items
      .query({ query: "SELECT c.id FROM c WHERE c.pk = @pk AND STARTSWITH(c.id, @p)",
               parameters: [{ name: "@pk", value: prefix.split("/")[0] }, { name: "@p", value: prefix.replace(/\//g, "|") + "|" }] },
             { partitionKey: prefix.split("/")[0] })
      .fetchAll();
    return (resources as { id: string }[]).map((r) => r.id.replace(/\|/g, "/"));
  }
  if (USE_BLOB) {
    const out: string[] = [];
    for await (const b of container().listBlobsFlat({ prefix: prefix + "/" })) out.push(b.name);
    return out;
  }
  const dir = localPath(prefix);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => `${prefix}/${f}`);
}
