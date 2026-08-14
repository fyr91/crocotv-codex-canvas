# Canvas 内置 ImageGen 落图操作规范

## 适用条件

只在同时满足以下条件时使用本操作：

- 执行后端为本地 Canvas；
- 用户对当前普通生图或图片修改任务明确指定 GPT；
- 用户没有明确要求“在画布上生成”、“走节点生成”或等价表达。

P5 Storyboard 标准模式仍按共享流程默认使用外部 GPT Image 02 节点链，不自动改走本操作。

## 内置生成与落图

1. 若已有准确的 Prompt Text，记录其节点 ID；否则保留本次实际送给 ImageGen 的完整 Prompt，由落图原子入口创建 Prompt Text。不得先创建一份 Prompt、实际生成时又静默改写为另一份。
2. 加载 Codex 内置 `imagegen` Skill，使用 built-in `image_gen`。已有图片修改时，先用 `view_image` 查看本地目标，再按 edit 语义调用；只作参考的图片明确标记为 reference。
3. 首次等待窗口为 120 秒。窗口内获得可用图片时，把选定结果复制到 CrocoTV 工作区下的运行时导入目录；不得让项目资产只存在于 `$CODEX_HOME/generated_images/`。
4. 调用专用原子入口 `canvas_place_imagegen_result`，传入工作区图片路径、实际 Prompt、可选的既有 `promptNodeId` 和有序 `referenceNodeIds`。该入口复用安全资源导入规则，然后用一次 canonical Canvas mutation 创建或复用 Prompt Text、创建 Image Node，并连接 Prompt Text → Image 及有序 Reference Image → Image。
5. 只有单纯导入非 ImageGen 文件时才直接使用 `canvas_import_resource`；本路由不得让代理手工拼装落图 metadata，也不得创建虚假 Image Config 或把该 Image 伪装成 Canvas Provider Result。

Image Node 至少记录：

```json
{
  "status": "success",
  "generationRoute": "codex-built-in-imagegen",
  "requestedRoute": "gpt",
  "actualModel": "codex-imagegen",
  "sourceKind": "imported-generation",
  "sourcePromptNodeId": "prompt-node-id",
  "promptSha256": "...",
  "orderedReferenceNodeIds": [],
  "inputSnapshot": {},
  "storageKey": "resource-id"
}
```

本路由的 Prompt → Image 连线是来源关系，不表示 Image 由 Canvas Config runtime 生成。

`canvas_place_imagegen_result` 会拒绝以下输入：工作区外文件、非图片文件、不存在或不是 Image 的参考节点、不存在或不是 Text 的 Prompt 节点，以及与传入 Prompt 内容不一致的既有 Prompt Text。资源导入与项目图变更是两个持久化边界；项目图的节点和连线在一次 canonical mutation 中原子提交，若图提交失败，已导入资源可能保留为未使用资源，后续可人工清理。

## 改走 Canvas 真实节点链

出现任一情况时，不执行上述落图，或终止等待并改走真实节点链：

- 用户明确指定在 Canvas/画布上生成；
- 内置 `imagegen` 在 120 秒首次等待窗口内未交付可用图片；
- 内置工具不可用或明确失败。

```text
Prompt Text + 有序 Reference Image
        ↓
openai:gpt-image@2 Image Config
        ↓ canvas_run_nodes
Image Result
```

回退时在 Config 记录 `requestedRoute: gpt`、`generationRoute: canvas-provider`、`actualModel: openai:gpt-image@2`和 `fallbackReason: builtin-timeout|builtin-unavailable|builtin-failed|user-requested-canvas`。无法取消的内置任务若晚到，其结果不得覆盖已锁定的 Canvas Result。

## 重跑和修订

- 内置落图路由没有 Config，因此不得对 Image 调用 `canvas_rerun_outputs`。需要修订时，保留旧 Image，将旧 Image + 新反馈 Prompt 作为新的 `imagegen` edit 输入，生成新 Image 并建立新连线。
- Canvas Provider 路由使用 `canvas_rerun_outputs`或新 Config 重跑，继续保留旧 Result 历史。
