export type CharacterGenerationOutput = {
  resource_id?: unknown;
};

export type CharacterGenerationHistoryItem = {
  status?: unknown;
  target_character_id?: unknown;
  outputs?: unknown;
  attached_resource_ids?: unknown;
};

export function resolveCharacterGenerationAttachment(
  item: CharacterGenerationHistoryItem,
  requestedResourceIds: unknown,
) {
  const characterId = String(item.target_character_id || "").trim();
  if (!characterId) throw new Error("该生成任务未关联角色");
  if (item.status !== "completed") throw new Error("只能加入已经完成的生成结果");

  const requested = uniqueStrings(requestedResourceIds);
  if (!requested.length) throw new Error("至少选择一个生成结果");
  if (requested.length > 20) throw new Error("一次最多加入 20 个生成结果");

  const outputIds = new Set(
    (Array.isArray(item.outputs) ? item.outputs : [])
      .map((output) => String((output as CharacterGenerationOutput)?.resource_id || "").trim())
      .filter(Boolean),
  );
  const invalid = requested.find((resourceId) => !outputIds.has(resourceId));
  if (invalid) throw new Error(`资源不是该任务的生成结果：${invalid}`);

  return {
    characterId,
    resourceIds: requested,
    attachedResourceIds: [...new Set([...uniqueStrings(item.attached_resource_ids), ...requested])],
  };
}

function uniqueStrings(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).map((item) => item.trim()).filter(Boolean))];
}
