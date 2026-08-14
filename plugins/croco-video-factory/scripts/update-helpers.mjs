import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

export function parseDirtyEntries(statusOutput) {
  return String(statusOutput || "").split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

export function findInstalledPlugin(inventory, pluginId) {
  return inventory?.installed?.find((entry) => entry.pluginId === pluginId && entry.installed && entry.enabled) || null;
}

export async function migrateStandaloneSkills({ skillsRoot, skillNames, backupRoot }) {
  const moved = [];
  try {
    for (const name of [...new Set(skillNames)].sort()) {
      const source = path.join(skillsRoot, name);
      if (!existsSync(source)) continue;
      const target = path.join(backupRoot, "skills", name);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(source, target);
      moved.push({ name, source, target });
    }
    return moved;
  } catch (error) {
    await restoreStandaloneSkills(moved);
    throw error;
  }
}

export async function restoreStandaloneSkills(moved) {
  for (const entry of [...moved].reverse()) {
    if (!existsSync(entry.target) || existsSync(entry.source)) continue;
    await mkdir(path.dirname(entry.source), { recursive: true });
    await rename(entry.target, entry.source);
  }
}
