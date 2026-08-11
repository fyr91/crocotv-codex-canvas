import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/stores/canvas/use-canvas-store.ts", import.meta.url), "utf8");
const assets = readFileSync(new URL("../src/services/api/cloud-assets.ts", import.meta.url), "utf8");
const deleteDialog = readFileSync(new URL("../src/components/canvas/canvas-delete-projects-dialog.tsx", import.meta.url), "utf8");
const projectPage = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");
const deleteAssets = assets.slice(assets.indexOf("export async function deleteCloudAssets"), assets.indexOf("function extensionFor"));
const deleteProjectsStart = store.indexOf("deleteProjects: async");
const deleteProjects = store.slice(deleteProjectsStart, store.indexOf("replaceProjects:", deleteProjectsStart));
const deleteCurrentProject = projectPage.slice(projectPage.indexOf("const deleteCurrentProject"), projectPage.indexOf("const handleCanvasMouseDown"));

assert.match(store, /saveStates: Record<string, CanvasSaveState>/);
assert.match(store, /copyProject: \(id: string\) => Promise<string>/);
assert.match(store, /deleteProjects: \(ids: string\[\]\) => Promise<string\[\]>/);
assert.match(store, /rpc\("list_canvas_projects"\)/);
assert.match(store, /update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/);
assert.doesNotMatch(store, /from\("canvas_projects"\)\.delete\(\)/);
assert.match(deleteProjects, /await supabase[\s\S]*\.select\("id"\)/);
assert.ok(deleteProjects.indexOf("await supabase") < deleteProjects.indexOf("projects: state.projects.filter"));
assert.match(deleteDialog, /await deleteProjects\(ids\)/);
assert.match(deleteDialog, /loading=\{deleting\}/);
assert.match(deleteCurrentProject, /await deleteProjects\(\[projectId\]\)/);
assert.ok(deleteCurrentProject.indexOf("await deleteProjects") < deleteCurrentProject.indexOf('navigate("/canvas")'));
assert.match(assets, /eq\("user_id", user\.user\.id\)\.is\("deleted_at", null\)/);
assert.match(deleteAssets, /update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/);
assert.doesNotMatch(deleteAssets, /storage\.from\("user-assets"\)\.remove/);

console.log("canvas cloud store contract tests passed");
