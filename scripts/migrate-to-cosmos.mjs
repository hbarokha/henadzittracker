// One-off copy of every stored document into Cosmos DB. Read-only on the source.
//
//   node --env-file=.env.local scripts/migrate-to-cosmos.mjs [--dry-run]
//
// Source: Azure Blob (AZURE_STORAGE_CONNECTION_STRING) if set, else ./data.
// Target: COSMOS_CONNECTION_STRING. Same document shape storage.ts reads/writes, so the
// app can be switched over by setting COSMOS_CONNECTION_STRING afterwards.
import fs from "node:fs";
import path from "node:path";
import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";

const dry = process.argv.includes("--dry-run");
const blobConn = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const cosmosConn = process.env.COSMOS_CONNECTION_STRING ?? "";
if (!cosmosConn) { console.error("COSMOS_CONNECTION_STRING is not set"); process.exit(1); }

async function* fromBlob() {
  const c = BlobServiceClient.fromConnectionString(blobConn)
    .getContainerClient(process.env.AZURE_STORAGE_CONTAINER ?? "henadzittracker");
  for await (const b of c.listBlobsFlat()) {
    yield [b.name, (await c.getBlobClient(b.name).downloadToBuffer()).toString("utf-8")];
  }
}

function* fromDisk(dir, rel = "") {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* fromDisk(dir, r);
    else yield [r, fs.readFileSync(path.join(dir, r), "utf-8")];
  }
}

const source = blobConn ? fromBlob() : fromDisk(path.join(process.cwd(), "data"));
console.log(`source: ${blobConn ? "Azure Blob" : "./data"}  →  Cosmos ${dry ? "(dry run)" : ""}`);

let container;
if (!dry) {
  const client = new CosmosClient(cosmosConn);
  const { database } = await client.databases.createIfNotExists({ id: process.env.COSMOS_DATABASE ?? "henadzittracker" });
  ({ container } = await database.containers.createIfNotExists({
    id: process.env.COSMOS_CONTAINER ?? "docs", partitionKey: { paths: ["/pk"] },
  }));
}

let ok = 0, skipped = 0;
for await (const [name, content] of source) {
  if (name.startsWith("debug-")) { skipped++; continue; }
  const doc = { id: name.replace(/\//g, "|"), pk: name.split("/")[0] };
  if (name.endsWith(".json")) {
    try { doc.data = JSON.parse(content); } catch { console.warn(`skip (bad JSON): ${name}`); skipped++; continue; }
  } else doc.text = content;
  if (Buffer.byteLength(JSON.stringify(doc)) > 1_900_000) { console.warn(`skip (>2MB): ${name}`); skipped++; continue; }
  if (!dry) await container.items.upsert(doc);
  ok++;
}
console.log(`${dry ? "would copy" : "copied"} ${ok}, skipped ${skipped}`);
