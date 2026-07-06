// Repair malformed (nameless) supplement records in the blob.
// Usage:  node scripts/fix-supplements.js           (dry run — prints plan, writes nothing)
//         node scripts/fix-supplements.js --apply    (backup + write)
const fs = require("fs");
const path = require("path");

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
const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = process.argv[process.argv.indexOf("--backup-dir") + 1] || ".";

// Names recovered from each record's OWN description/usageTip text (not invented).
// Placeholder names (derived from dose) are used only for taken records with no other clue,
// so they render as editable rows instead of vanishing.
const NAME_PATCHES = {
  "1782329604777": "Quercetin",            // desc: "two Quercetin pills"
  "1782329715225": "Phosphatidylserine",   // desc: "Phosphatidylserine supports cognitive function"
  "1782329813134": "Nootropic Blend",      // desc: "This blend of nootropics"
  "1782652034781": "Quercetine",           // desc: "this Quercetine 250mg"
  "1782653613376": "Phosphatidylserine",   // desc: "Take Phosphatidylserine in the morning"
  "1782329556140": "Supplement (500 mg)",  // placeholder — only dose known, was taken 06-24/25
  "1782329584493": "Supplement (250 mg)",  // placeholder — was taken 06-24/25
  "1782329625760": "Supplement (100 mg)",  // placeholder — was taken 06-24/25
};

(async () => {
  const c = BlobServiceClient.fromConnectionString(cs).getContainerClient(container);
  const blob = c.getBlockBlobClient("supplements.json");
  const buf = await blob.downloadToBuffer();
  const raw = buf.toString();
  const d = JSON.parse(raw);

  const takenCount = (id) => d.log.filter((l) => l.supplementId === id && l.taken).length;

  console.log("=== Planned name repairs ===");
  let changes = 0;
  for (const s of d.supplements) {
    const hasName = (s.name ?? "").trim().length > 0;
    if (hasName) continue;
    const patch = NAME_PATCHES[s.id];
    if (patch) {
      console.log(`  ${s.id}: "" -> "${patch}"   (taken ${takenCount(s.id)}x, dose ${s.dose ?? "?"}${s.unit ?? ""})`);
      if (APPLY) s.name = patch;
      changes++;
    } else {
      console.log(`  ${s.id}: LEFT nameless (never taken / unidentifiable, dose ${s.dose ?? "?"}${s.unit ?? ""})`);
    }
  }
  console.log(`\n${changes} record(s) ${APPLY ? "patched" : "would be patched"}.`);

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to save.");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `supplements-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, raw);
  console.log(`\nBackup written: ${backupPath}`);

  const out = JSON.stringify(d);
  await blob.upload(out, Buffer.byteLength(out), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
  console.log("Blob updated: supplements.json");
})().catch((e) => console.error("ERR", e.message));
