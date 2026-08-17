import assert from "node:assert/strict";
import test from "node:test";
import { findReusableEntityExtraction, parseStudioJson } from "./studio-entity-extraction-recovery";

const NOW = Date.parse("2026-08-17T04:40:00.000Z");

function successfulFixture(text = "同一份剧本") {
  return {
    text,
    now: NOW,
    nodes: [
      {
        id: "input-node",
        metadata: {
          content: JSON.stringify({ operation: "entity_extraction", draftPrompt: text }),
          status: "success",
        },
      },
      {
        id: "output-node",
        metadata: {
          content: JSON.stringify({
            characters: [{ id: "hero", name: "主角" }],
            scenes: [{ id: "room", name: "房间" }],
            props: [{ id: "lamp", name: "灯" }],
          }),
          status: "success",
        },
      },
    ],
    executions: [{
      operation: "entity_extraction",
      sourceNodeIds: ["input-node"],
      outputNodeIds: ["output-node"],
      createdAt: "2026-08-17T04:34:54.431Z",
    }],
  };
}

test("复用同剧本最近成功的实体提取结果", () => {
  const recovered = findReusableEntityExtraction(successfulFixture());
  assert.deepEqual(recovered?.characters, [{ id: "hero", name: "主角" }]);
  assert.deepEqual(recovered?.scenes, [{ id: "room", name: "房间" }]);
  assert.deepEqual(recovered?.props, [{ id: "lamp", name: "灯" }]);
});

test("剧本文本变化或结果过期时不复用", () => {
  assert.equal(findReusableEntityExtraction({ ...successfulFixture(), text: "已经修改的剧本" }), undefined);
  assert.equal(findReusableEntityExtraction({ ...successfulFixture(), now: NOW + 20 * 60_000 }), undefined);
});

test("失败输出或缺少实体数组时不复用", () => {
  const failed = successfulFixture();
  failed.nodes[1].metadata.status = "error";
  assert.equal(findReusableEntityExtraction(failed), undefined);

  const incomplete = successfulFixture();
  incomplete.nodes[1].metadata.content = JSON.stringify({ characters: [], scenes: [] });
  assert.equal(findReusableEntityExtraction(incomplete), undefined);
});

test("Studio JSON 解析支持 fenced JSON 并返回稳定错误", () => {
  assert.deepEqual(parseStudioJson("```json\n{\"characters\": []}\n```"), { characters: [] });
  assert.throws(() => parseStudioJson("not-json"), /Studio JSON 无法解析/);
});
