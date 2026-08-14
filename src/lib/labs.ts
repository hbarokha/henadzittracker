// ── Blood work persistence ────────────────────────────────────────────────────
// Storage only. Everything pure — the biomarker catalog, unit conversion, range
// interpretation and prompt formatting — lives in labs-catalog.ts so client components
// can import it without pulling the Azure/fs storage layer into the browser bundle.

import { readJson, mutateJson } from "@/lib/storage";
import type { LabPanel } from "@/lib/labs-catalog";

export * from "@/lib/labs-catalog";

const BLOB = "labs.json";

export async function getLabPanels(): Promise<LabPanel[]> {
  const panels = (await readJson<LabPanel[]>(BLOB)) ?? [];
  return panels.sort((a, b) => a.date.localeCompare(b.date));
}

export async function addLabPanel(
  panel: Omit<LabPanel, "id" | "createdAt">
): Promise<LabPanel> {
  const entry: LabPanel = { ...panel, id: String(Date.now()), createdAt: new Date().toISOString() };
  await mutateJson<LabPanel[]>(BLOB, [], (panels) => {
    panels.push(entry);
    return { write: true };
  });
  return entry;
}

export async function deleteLabPanel(id: string): Promise<void> {
  await mutateJson<LabPanel[]>(BLOB, [], (panels) => {
    const idx = panels.findIndex((p) => p.id === id);
    if (idx < 0) return { write: false };
    panels.splice(idx, 1);
    return { write: true };
  });
}

