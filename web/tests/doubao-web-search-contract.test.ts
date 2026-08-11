import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/stores/use-config-store.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/types/canvas.ts", import.meta.url), "utf8");
const promptPanel = readFileSync(new URL("../src/components/canvas/canvas-node-prompt-panel.tsx", import.meta.url), "utf8");
const configPanel = readFileSync(new URL("../src/components/canvas/canvas-config-node-panel.tsx", import.meta.url), "utf8");
const imageApi = readFileSync(new URL("../src/services/api/image.ts", import.meta.url), "utf8");
const project = readFileSync(new URL("../src/pages/canvas/project.tsx", import.meta.url), "utf8");

assert.match(store, /export function modelSupportsWebSearch\(model: string\)/, "模型清单应暴露联网搜索能力");
assert.match(types, /webSearch\?: boolean;/, "画布节点应保存 Web Search 开关");
assert.match(promptPanel, /modelSupportsWebSearch\(config\.model\)/, "独立文本节点应按模型能力显示开关");
assert.match(promptPanel, /Web Search/, "独立文本节点应显示 Web Search 文案");
assert.match(configPanel, /modelSupportsWebSearch\(config\.model\)/, "生成模组文本模式应按模型能力显示开关");
assert.match(configPanel, /Web Search/, "生成模组应显示 Web Search 文案");
assert.match(imageApi, /webSearch: options\?\.webSearch === true/, "文本生成请求应传递 Web Search 参数");
assert.match(project, /webSearch: modelSupportsWebSearch\(generationConfig\.model\)/, "画布生成链路应校验模型能力后启用搜索");

console.log("doubao web search contract tests passed");
