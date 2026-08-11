---
name: pull-latest-characters
description: Use when a user asks to pull, refresh, update, or sync the latest published CrocoBack characters, teachers, voices, prompts, character assets, or Character Sheet source folders into the local Codex Pipeline.
---

# Pull Latest Characters

Synchronize the current CrocoBack published character catalog into `characters/` through the read-only export API.

## Workflow

1. Set the working directory to the CrocoTV repository root. The bundled script resolves `.codex/.env` and `characters/` from that directory.
2. Confirm `.codex/.env` contains `CROCO_CHARACTERS_API_URL` and `CROCO_CHARACTERS_API_TOKEN`. Name missing variables without printing secret values.
3. Run:

```bash
node <pull-latest-characters-skill>/scripts/pull-latest-characters.mjs
```

4. Report the publish version and the `added`, `updated`, `unchanged`, and `assetsDownloaded` counts printed by the script.
5. Tell the user that every synchronized character directory contains `character-sheet/`, where they can add reference images for that character. Do not pause the parent Auto workflow for this notice.

## Safety Rules

- Treat the remote current publish version as the source only for active character updates.
- Never delete, move, rename, mark, or otherwise modify a local character that is absent from the remote response.
- Create a missing `character-sheet/` directory for each synchronized character, but never overwrite, move, delete, rename, or otherwise modify anything already inside it.
- Never print or commit the API token.
- Do not manually edit synchronized files or duplicate the API logic; use the bundled script.
- Stop and report the error if authentication, download, byte-size validation, or SHA-256 validation fails.
