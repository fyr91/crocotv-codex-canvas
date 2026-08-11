import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/prompts/prompt-select-dialog.tsx", import.meta.url), "utf8");

assert.doesNotMatch(source, /管理我的提示词/, "the canvas prompt library does not link to prompt management");
assert.doesNotMatch(source, /navigate\("\/prompts"\)/, "the dialog does not navigate away from the canvas");
assert.doesNotMatch(source, /useNavigate|BookMarked/, "navigation-only imports are removed");
assert.match(source, /placeholder="按标题查询"/, "prompt search remains available");
assert.match(source, /handleListScroll/, "incremental prompt loading remains available");
assert.match(source, /使用此提示词/, "users can still insert a prompt into the canvas");

console.log("prompt select dialog contract tests passed");
