#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { configFromEnv, fetchCharacterCatalog, syncCharacterCatalog } from './character-sync.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pipelineRoot = path.resolve(process.env.CROCOTV_HOME || process.cwd());
const envPath = process.env.CROCO_ENV_FILE || path.join(pipelineRoot, '.codex', '.env');

try {
  process.loadEnvFile(envPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

try {
  const config = configFromEnv(process.env, pipelineRoot);
  const catalog = await fetchCharacterCatalog(config);
  const summary = await syncCharacterCatalog(catalog, config);
  console.log(JSON.stringify({
    publishVersion: catalog.publishVersion,
    remoteCharacters: catalog.characters.length,
    ...summary,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
