# Canvas 节点产物契约

## 契约边界

本契约只定义[固定 P1–P10 制作流程](执行后端选择规范.md)的产物如何在 Canvas 中执行、保存、连接和布局，不定义新的生产阶段。每个节点必须对应真实输入、执行配置、结果、快照或验收记录；不得创建只模拟进度的节点。Canvas 与 Skill 原生后端的阶段产物语义必须一致。

## 分组模型

画布的所有列都复用现有 `canvas_upsert_shot_column` 和 `groupKind: shot-column`，不新增 Group 类型。通过 `shotId` 区分三种语义角色：

| Group | 用途 | 关键标识 |
|---|---|---|
| 项目公共列 | P1–P3 的全局简报、脚本、角色、场景和风格产物 | `shotId: project`、`groupKind: shot-column` |
| 正式分镜列 | 按分镜从左到右排列，纵向放置该分镜的 P2–P5 来源、P4 音频、P7 Prompt、P8 Video 和 P9 验收 | `shotId: shot-*`、`groupKind: shot-column` |
| Pre-roll 列 | 承载不属于单一正式分镜的 P6 真实执行图 | `shotId: pre-roll`、`groupKind: shot-column`；子节点记录 `stage: P6` |

正式分镜列是最终主布局：一个分镜一列，包含该分镜的文案、角色、场景、音频、Storyboard、Prompt、Video、首中尾帧和验收。节点创建时立即进入目标列，不得生成后再依赖手工整理。Comment 不建立连接，但占据正常布局空间。

## 阶段与布局分区

| 阶段 | 典型产物 | `layoutSection` / 默认顺序 |
|---|---|---|
| P1 | 需求、项目、角色索引 | `project` / 10 |
| P2 | 事实、大纲、文案、最终脚本 | `script` / 20 |
| P3 | 角色、NPC、场景、风格与图像验收 | `visual-definition` / 30 |
| P4 | 语气优化、Speech Config、Audio 和真实时长 | `audio` / 40 |
| P5 | 分镜脚本、Storyboard Config/Image 与连续性 | `storyboard` / 50 |
| P6 | 在 Pre-roll 列内按来源、核心点、Storyboard 抽取、场景脚本/风格、Preview Prompt、H3 Video、调整和确认的顺序排列 | `pre-roll-source/script/reference/prompt/video/approval` / 10–90 |
| P7 | H3 System Prompt、基础/最终 Prompt 和有序素材快照 | `h3-prompt` / 60 |
| P8 | H3 Config、Video 和尾帧 | `h3-video` / 70 |
| P9 | 首中尾帧、ASR、视觉验收和 Comment | `verification` / 80–90 |
| P10 | 合片 Config、最终 Video 和可追溯记录 | `delivery` / 100 |

P6 Video 记录 `previewOnly: true` 和 `mergeEligible: false`，不得接入 P10。P8 中通过当前快照且 P9 验收合格的正式分镜 Video 才能记录 `mergeEligible: true`。

## 必需 metadata

每个 Video Factory 节点至少记录：

```json
{
  "factoryRunId": "factory-...",
  "shotId": "shot-03",
  "stage": "P8",
  "artifactType": "h3-video-config",
  "layoutManaged": true,
  "layoutSection": "h3-video",
  "layoutOrder": 70
}
```

Group 额外记录 `groupKind`、`columnIndex` 和 `layoutDirection: vertical`；子节点记录 `groupId`。同一角色或场景在多个分镜列中可使用不同画布节点，但必须复用统一资源库的同一 `storageKey`，不复制本地文件。

## 排序、间距与禁止重叠

默认 Group 内边距 48px、节点纵向间距 56px、分区间距 96px、列间距 160px；使用节点真实 width/height 排版。节点或 Group 重叠是写入失败条件：

- `next.y = previous.y + previous.height + gap`；
- 新节点只能原位更新或追加到当前列的下一无碰撞位置；
- 节点高度变化时下方受管理节点自动下移；
- 新增节点只能扩大 Group，不能侵入相邻列；
- 首、中、尾帧纵向排列；
- 一次原子操作完成创建、连接、布局、碰撞检测、保存和事件发布。

用户手动布局节点可设为 `layoutManaged: false`。后续重排保留其位置且让其他节点绕开；如果两个手动节点已重叠，布局操作必须失败并报告节点 ID。

## 连接契约

只建立真实数据或生成依赖：输入/结果 → Config、前镜尾帧 → 后镜 P7/P8 Config、明确复用的角色/场景/音频 → 当前 Config。普通连接线不因 MCP 创建而改变样式。独立分镜之间不得为了视觉连续而添加无语义连接。Comment 一律不连线。

## 输入快照、确认和失效

生成结果保存 `inputSnapshot`，至少包含 user prompt SHA-256、System Prompt SHA-256 及节点 ID、普通来源节点 ID，以及图片、视频和音频资源 ID 的有序数组。任一输入内容、资源 ID、顺序、System Prompt 或前镜尾帧变化时，只使受影响结果和依赖链过期。

所有用户门禁确认统一保存 `approvalSnapshot`，包含 `stage`、当前产物 ID/哈希、输入快照哈希、确认时间和可选调整哈希。P2、P3 和 P5 在互动模式使用该契约；P6 在所有模式使用，且产物哈希必须是当前 Pre-roll Video SHA-256，输入快照必须覆盖 P2–P5 来源及 P6 中间产物。任一绑定值变化都撤销该确认并阻止下游，直到重新确认。
