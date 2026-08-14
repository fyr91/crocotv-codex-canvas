# Canvas 节点产物契约

## 契约边界

本契约只定义[唯一 P1–P8 流程](执行后端选择规范.md)的产物如何在 Canvas 中保存、连接和布局。每个节点必须是真实输入、System Prompt、执行 Config、Result、快照、Gate、验收或用户 Comment；不得用节点模拟研究、验证或执行进度。

## 分组与列

继续复用 `groupKind: shot-column`，不新增 Group 类型：

| Group | 用途 | 标识 |
|---|---|---|
| 项目公共列 | P1 简报、P2 剧本链、P3 公共资产、P4 导演总纲 | `shotId: project` |
| 正式分镜列 | P4 确立后，一个 Storyboard Unit 一列；可跨不同 `sceneId` | `shotId: shot-*` |

正式分镜列按 `shotOrder` 从左到右；列内纵向放置 P4 文字分镜、P5 Storyboard、P6 Prompt、P8 Config/Video 和综合评估 Comment/metadata。同一 `shotId` 的多个 `generationSegmentId` 依次放在同一列。P3 角色/场景资产作为统一资源输入连接到需要它们的列，不复制本地资源文件。

## 阶段布局

| 阶段 | 典型产物 | `layoutSection` / 默认顺序 |
|---|---|---|
| P1 | 需求、项目简报、资源索引 | `project` / 10 |
| P2 | 主题/大纲、事实输入与 Gate、剧本、确认 | `script` / 20 |
| P3 | 角色/Variation/Voice、四视图、场景/道具、综合设定图；用户指定 GPT 时可包含 Prompt → ImageGen imported Image | `production-design` / 30 |
| P4 | 导演总纲、正式分镜 Result、跨分镜审核 | `director-plan` / 40 |
| P5 | Storyboard Prompt、Config/Image、验收 | `storyboard` / 50 |
| P6 | Ref2VA 通用 System、runtime brief、豆包 Final Prompt、lock | `h3-prompt` / 60 |
| P8 | 正式 H3 Config、Video、尾帧、实际时长、Codex 综合评估 Comment/metadata | `h3-video` / 70；`video-evaluation` / 80 |

## 必需 metadata

每个 Video Factory 节点至少记录：

```json
{
  "factoryRunId": "factory-...",
  "shotId": "shot-03",
  "stage": "P6",
  "artifactType": "h3-prompt-result",
  "layoutManaged": true,
  "layoutSection": "h3-prompt",
  "layoutOrder": 60
}
```

分镜节点按需增加 `shotOrder`、`storySegmentId`、`sceneIds`、`generationSegmentId`、`targetDurationSeconds`、`actualDurationSeconds`、`continuity.type`、`dependsOnShotId`。一个 P4 分镜跨场景时使用有序 `sceneIds`；P6 可在场景切换处产生多个生成片段，但不得把它们冒充新的 P4 `shotId`。

System Prompt 节点增加 `promptRole: system`、`templateKey`、`templateVersion`、`contentSha256`。模型 Result 增加 `generatedByConfigId` 和 `inputSnapshot`; 不允许 canonical Text update 覆盖正文。确定性 Text 增加 `deterministic: true` 与 `sourceNodeIds/sourceArtifactIds`。内置 ImageGen 落图 Image 不记录 `generatedByConfigId`，而记录 `generationRoute: codex-built-in-imagegen`、`sourceKind: imported-generation`、`sourcePromptNodeId`、`promptSha256`、`orderedReferenceNodeIds` 和 `inputSnapshot`。P8 综合评估记录增加 `artifactType: p8-video-evaluation`、Video/P2/P4/P6 哈希、各维度证据、问题归因和唯一总评；它不含 `generatedByConfigId`，也不伪装为模型 Result。

## 连接契约

- 只建立真实数据依赖：输入/Result → Config、System Text → Config、Reference → 媒体 Config、前镜尾帧 → 后镜 H3 Config。
- 内置 ImageGen 落图使用 Prompt Text → imported Image 的来源连线；有参考图时增加有序 Reference Image → imported Image。该链不包含 Config，不得冒充 Canvas Provider Result。
- 上述来源图统一由 `canvas_place_imagegen_result` 建立；通用 `canvas_apply_operations` 不作为该场景的默认手工拼装入口。
- 模型修订链连接“当前候选 Result + 审核 Result + 人工反馈 Text → 修订 Config”；不得直接修改候选 Result。
- `independent` 分镜之间不连线；`soft-continuity` 共享资产但不等待；`tail-frame` 必须直接连接前镜尾帧。
- Comment 不连线，只记录人工解释或决策；Gate 的机器可验证状态使用 metadata/approval snapshot。

## 输入、锁定与确认快照

生成结果的 `inputSnapshot` 至少包含：user/System Prompt SHA-256 与节点 ID、普通来源节点 ID、有序图片/视频/音频资源 ID、前镜尾帧哈希。任一绑定内容、资源 ID、顺序或哈希变化时，只使受影响结果和依赖链过期。

锁定产物记录 `lockSnapshot`，包含当前产物节点 ID/哈希、System Prompt 版本/哈希、输入快照哈希和锁定时间；它不代表额外内容校验。所有用户 Gate 使用 `approvalSnapshot`：

```json
{
  "stage": "P2",
  "artifactId": "node-...",
  "artifactSha256": "...",
  "inputSnapshotSha256": "...",
  "approvedAt": "...",
  "feedbackSha256": null
}
```

P2 最终剧本在所有模式强制使用用户 Gate；其他阶段沿用共享流程的可选 Gate。绑定值变化立即撤销确认。

P8 Video 固定 `previewOnly: false`。其综合评估记录必须绑定 Video storage key、P2/P4/P6 哈希、目标/实际时长、各维度证据、问题归因和唯一总评；它不是分析 Config Result。`regenerate` 只使当前 Video 过期，`revise-p6` 使受影响 P6/P8 片段过期。P8 总评通过前不得锁定当前 Video；安全合片仍属于后续流程。

## 布局与原子性

默认 Group 内边距 48px、节点间距 56px、分区间距 96px、列间距 160px。创建、连接、碰撞检查、保存、项目版本递增和事件发布必须在 canonical atomic command 中完成。尊重 `layoutManaged: false` 的人工布局；受管理节点不得与任何节点重叠。
