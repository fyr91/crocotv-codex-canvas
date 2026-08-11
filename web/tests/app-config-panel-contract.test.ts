import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(new URL("../src/components/layout/app-config-modal.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/config/index.tsx", import.meta.url), "utf8");

assert.match(panel, /label: "默认模型"/);
assert.match(panel, /initialTab\?: ConfigTabKey/);
assert.match(panel, /配置已保存/);
assert.match(panel, /<Modal title="配置"/);
assert.doesNotMatch(panel, /生成偏好/);
assert.doesNotMatch(panel, /audioVoice|audioFormat|audioSpeed|videoSeconds|systemPrompt/);
assert.match(page, />配置<\/h1>/);
assert.match(page, /选择管理员启用的全局模型/);
assert.doesNotMatch(page, /配置与用户偏好|个人生成偏好/);

console.log("app config panel contract tests passed");
