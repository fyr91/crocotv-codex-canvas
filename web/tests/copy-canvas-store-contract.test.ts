import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/stores/canvas/use-canvas-store.ts", import.meta.url), "utf8");
const start = source.indexOf("copyProject: async (id) =>");
const copyProject = source.slice(start, source.indexOf("loadTemplatePreview:", start));

assert.match(copyProject, /supabase\.rpc\("copy_canvas_project"/);
assert.match(copyProject, /source_project_id: id/);
assert.match(copyProject, /target_project_id: targetId/);
assert.match(copyProject, /await fromRow\(row\)/);
assert.doesNotMatch(copyProject, /insertProject\(/);

console.log("copy canvas store contract test passed");
