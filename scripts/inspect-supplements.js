// Inspect supplements blob — read-only. Finds malformed records + orphaned log entries.
const fs = require("fs");
function loadEnv(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(".env.local");
loadEnv(".env");

const { BlobServiceClient } = require("@azure/storage-blob");
const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
const container = process.env.AZURE_STORAGE_CONTAINER || "henadzittracker";

(async () => {
  const c = BlobServiceClient.fromConnectionString(cs).getContainerClient(container);
  const buf = await c.getBlockBlobClient("supplements.json").downloadToBuffer();
  const d = JSON.parse(buf.toString());
  const byId = Object.fromEntries(d.supplements.map((s) => [s.id, s]));

  const named = (s) => s && (s.name ?? "").trim().length > 0;

  console.log("=== Malformed supplement records (no usable name) ===");
  const malformed = d.supplements.filter((s) => !named(s));
  for (const s of malformed) console.log(JSON.stringify(s));
  console.log("malformed count:", malformed.length);

  console.log("\n=== Log entries whose supplementId has NO record at all ===");
  const orphanIds = new Set();
  for (const l of d.log) if (!byId[l.supplementId]) orphanIds.add(l.supplementId);
  console.log("orphan ids (no record):", [...orphanIds]);

  console.log("\n=== TAKEN log entries pointing at malformed/orphaned records ===");
  const badTaken = d.log.filter((l) => l.taken && !named(byId[l.supplementId]));
  const byBadId = {};
  for (const l of badTaken) (byBadId[l.supplementId] ||= []).push(l.date);
  for (const [id, dates] of Object.entries(byBadId)) {
    const rec = byId[id];
    console.log(`id=${id} record=${rec ? JSON.stringify(rec) : "MISSING"} takenDates=${dates.sort().join(",")}`);
  }

  console.log("\n=== All supplements (id, name, brand, active) ===");
  for (const s of d.supplements)
    console.log(`${s.id} | active=${s.active} | "${s.name ?? ""}" | ${s.brand ?? ""}`);
})().catch((e) => console.error("ERR", e.message));
