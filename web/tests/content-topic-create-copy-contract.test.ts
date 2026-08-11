import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const createModal = readFileSync(new URL("../src/pages/content/components/topic-create-modal.tsx", import.meta.url), "utf8");
const createForm = readFileSync(new URL("../src/pages/content/components/topic-create-form.tsx", import.meta.url), "utf8");
const workboard = readFileSync(new URL("../src/pages/content/workboard.tsx", import.meta.url), "utf8");

assert.match(createForm, /label="Topic 标题"/, "Topic title should remain a short, scannable title");
assert.match(createForm, /label="Topic 描述"/, "the detailed brief should be labeled Topic 描述");
assert.doesNotMatch(createModal + createForm, /原始 Topic/, "the create form should not expose the ambiguous 原始 Topic wording");
assert.doesNotMatch(workboard, /Topic 已退回公共池|基于 Topic 描述重新开始/, "abandoning should not show an additional success explanation");

console.log("content topic create copy contract passed");
