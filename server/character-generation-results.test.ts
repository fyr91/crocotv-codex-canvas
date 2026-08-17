import assert from "node:assert/strict";
import test from "node:test";
import { resolveCharacterGenerationAttachment } from "./character-generation-results";

test("角色生成结果仅能从完成任务中确认加入", () => {
  assert.throws(
    () => resolveCharacterGenerationAttachment({ status: "processing", target_character_id: "char-1", outputs: [] }, ["resource-1"]),
    /只能加入已经完成/,
  );
});

test("角色生成结果确认会校验归属并保持幂等记录", () => {
  const resolved = resolveCharacterGenerationAttachment({
    status: "completed",
    target_character_id: "char-1",
    outputs: [{ resource_id: "resource-1" }, { resource_id: "resource-2" }],
    attached_resource_ids: ["resource-1"],
  }, ["resource-1", "resource-2", "resource-2"]);

  assert.deepEqual(resolved, {
    characterId: "char-1",
    resourceIds: ["resource-1", "resource-2"],
    attachedResourceIds: ["resource-1", "resource-2"],
  });
  assert.throws(
    () => resolveCharacterGenerationAttachment({
      status: "completed",
      target_character_id: "char-1",
      outputs: [{ resource_id: "resource-1" }],
    }, ["resource-from-another-task"]),
    /不是该任务的生成结果/,
  );
});
