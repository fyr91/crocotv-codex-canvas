#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repositoryRoot, "plugins", "croco-video-factory");
const skillsRoot = path.join(pluginRoot, "skills");
const compatibility = JSON.parse(await readFile(path.join(repositoryRoot, "compatibility.json"), "utf8"));
const plugin = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const skills = {};

for (const entry of (await readdir(skillsRoot, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  skills[entry.name] = {
    version: compatibility.components.skillsBundle,
    sha256: await directoryHash(path.join(skillsRoot, entry.name)),
  };
}

const manifest = {
  schemaVersion: 1,
  suiteVersion: compatibility.suiteVersion,
  pluginVersion: plugin.version,
  mcpVersion: compatibility.components.mcp,
  skillsBundleVersion: compatibility.components.skillsBundle,
  contracts: compatibility.contracts,
  requires: {
    crocoTV: compatibility.compatibility.crocoTV,
    canvasApi: compatibility.contracts.canvasApi,
    projectSchema: compatibility.contracts.projectSchema,
    environmentSchema: compatibility.contracts.environmentSchema,
  },
  skills,
};

await writeFile(path.join(pluginRoot, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated bundle manifest for ${Object.keys(skills).length} skills.`);

async function directoryHash(directory) {
  const hash = createHash("sha256");
  for (const file of await walk(directory)) {
    hash.update(path.relative(directory, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function walk(directory) {
  const files = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name === "node_modules" || name === ".DS_Store") continue;
    const target = path.join(directory, name);
    if ((await stat(target)).isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}
