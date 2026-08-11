# Croco Canvas Local — Agent Guide

## Product scope

This repository is a fully local CrocoTV canvas and its installable Codex Plugin. Preserve the visual language, components, assets, node behavior, and interaction patterns already implemented in `web/`; do not rebuild parallel UI systems. The historical `refs/` tree is local-only and is not part of the distributable source.

The supported product surface is the infinite canvas and its local resources/generation capabilities. Do not reintroduce account management, sharing, shared assets, Happy Horse, or the removed workflow-node product surface.

Every canvas is stored in its own folder under `data/projects/<project-id>/`. All uploaded, pulled-character, and generated resources belong in the unified local resource tree under `data/resources/` and its index.

## Repository structure

- `server/index.ts`: local Express API and service startup.
- `server/storage.ts`: atomic project/resource persistence and project version control.
- `server/canvas-commands.ts`: canonical atomic mutations for nodes, connections, project titles, and viewport state.
- `server/canvas-events.ts`: server-to-browser project event stream.
- `server/canvas-node-runtime.ts`: shared execution path for generation-module nodes; both the browser and MCP must call this runtime so connected inputs and generated result graphs stay reproducible.
- `plugins/croco-video-factory/mcp/server.ts`: authoritative Codex-facing STDIO MCP server.
- `server/mcp.ts`: compatibility entry point only; do not add MCP behavior there.
- `server/providers.ts`: Runware, Volcano Engine/Ark, BigModel, H3, and Suno provider adapters.
- `server/speech.ts`: character-voice speech generation.
- `server/characters.ts`: pull-characters synchronization and unified resource ingestion.
- `web/src/pages/canvas/project.tsx`: CrocoTV canvas UI and local interaction orchestration.
- `web/src/stores/canvas/use-canvas-store.ts`: browser project state and debounced persistence.
- `web/src/services/canvas-live-sync.ts`: applies MCP/server changes to an open canvas.
- `web/src/types/canvas.ts`: canonical browser-side node and connection types.
- `data/`: local runtime data; do not treat generated/user data as source fixtures.
- `plugins/croco-video-factory/skills/`: authoritative distributable Skill sources.
- `.codex/.env`: shared local secrets for CrocoTV, MCP, and Skill scripts; never commit it.
- `compatibility.json`: suite version mapping and shared contract versions.

## Canonical write path

Do not edit `data/projects/*/project.json` directly. Do not add a second persistence path.

All non-UI canvas mutations must use `server/canvas-commands.ts`. Mutations must:

1. run atomically through the per-project queue;
2. validate node types and references;
3. increment the project version;
4. save through `server/storage.ts`;
5. publish a complete project update through `server/canvas-events.ts`.

The browser must subscribe to server updates and must not overwrite a newer MCP change with a delayed full-document save.

Generation-module execution is also canonical: browser clicks and MCP calls must use `server/canvas-node-runtime.ts`. Do not add a provider call path that visually resembles a connected node flow while discarding the connected media payloads.

## MCP parity rule

For every change to local canvas capabilities, explicitly decide whether the MCP surface must change. This check is mandatory even when the answer is “no.”

Update `plugins/croco-video-factory/mcp/server.ts`, its schemas/descriptions, and MCP verification whenever a change adds or modifies any of the following:

- project creation, deletion, naming, loading, or persistence;
- node types, node metadata, default sizes, status values, or placement behavior;
- connection rules or port semantics;
- generation providers, models, parameters, progress, cancellation, or result shapes;
- local resource import, storage layout, character assets, or voice selection;
- canvas selection, focus, viewport, or other remotely useful actions;
- any command that a Codex agent should be able to perform without clicking the UI.

When MCP does not need an update, record the reason in the final handoff or change summary. UI-only styling changes normally do not require MCP changes unless they alter a node's persisted or callable behavior.

New MCP write tools must use typed schemas, bounded inputs, clear side-effect annotations, and the canonical command layer. Prefer one atomic batch tool over many tiny calls when an agent commonly needs to construct a graph.

## Local service behavior

The STDIO MCP server must be able to start CrocoTV when the local API/web app is not running. Startup must be idempotent: check health first, never create a duplicate service, keep MCP protocol output off stdout, and write background service logs under `data/runtime/`.

Keep the API and web service bound to local interfaces. File-import tools must restrict readable paths to explicitly allowed local roots and must copy imported files into the unified resource store.

## Provider rules

- LLM channels are provider channels, not model names. Preserve explicit model choices.
- Runware includes Gemini models and Nano Banana image models.
- Volcano Engine/Ark includes the configured Doubao and DeepSeek models.
- BigModel includes GLM models and should preserve model reasoning; do not silently disable thinking.
- Speech voices come from pull characters.
- Video generation uses the configured H3 integration.
- Music generation uses Suno and its runtime-created callback service; do not require a callback URL in `.env`.

Never expose API keys, callback secrets, or character access tokens in logs, MCP results, project JSON, or browser state.

## Distribution source of truth

Edit Plugin Skills and MCP only under `plugins/croco-video-factory/`. Codex's global/cache installation is a generated consumer and must never be treated as an editable source. After changing any bundled Skill or MCP, run the full build so runtime bundles and `bundle-manifest.json` are regenerated. Keep `package.json`, `.codex-plugin/plugin.json`, and `compatibility.json` versions synchronized for releases.

## Verification

After relevant changes:

1. run `npm run build`;
2. verify `GET /api/status`;
3. exercise the affected REST command directly;
4. start the MCP server with an MCP client and list/call the affected tool;
5. verify that an already-open canvas updates without refresh;
6. verify project version increments and no delayed browser save overwrites the MCP result.

For generation changes, test the actual Canvas/MCP path, not only a provider curl call. Avoid paid generation calls unless they are required by the requested verification.
