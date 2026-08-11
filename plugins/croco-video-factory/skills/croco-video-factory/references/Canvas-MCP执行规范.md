# Canvas MCP 阶段执行适配器

## 适配器边界

本文件只实施[固定 P1–P10 制作流程](执行后端选择规范.md)，不定义 Canvas 专属阶段、产物或门禁。Canvas 中的 Text、Image、Audio、Video、Config、Group 和 Comment 必须参与当前阶段的真实执行或保存真实产物；不得创建进度示意节点。所有模型与媒体调用必须通过现有 Config 节点运行时完成。

## 启动与读取

1. 调用 `canvas_start_local_service`，再调用 `canvas_get_service_status`。
2. 创建或读取目标 Canvas；使用稳定 `factoryRunId` 隔离本次生产。
3. 调用 `canvas_sync_characters` 和 `canvas_list_characters`；正式角色只能使用用户点名项。
4. 使用 `canvas_query_nodes` 按 `factoryRunId`、`shotId`、`stage` 和 `artifactType` 读取所需子集，避免反复读取整张大型画布。

## 通用图构建与运行

- 项目公共输入使用 `shotId: project`；每个正式分镜使用独立 shot 列；P6 使用 `shotId: pre-roll` 的阶段列。所有 Group 遵守[Canvas 节点产物契约](Canvas节点产物契约.md)。
- 创建、更新或删除分镜/阶段节点时调用 `canvas_upsert_shot_column`，在同一原子调用中建立真实依赖连接。节点尺寸、分镜顺序或整理需求变化时调用 `canvas_relayout_shot_columns`。
- 先创建输入 Text/Image/Audio/Video 和 Config；普通 user 内容使用 `@[node:ID]` 且必须真实连接到 Config。System Prompt Text 使用 `promptRole: system`，只连接 Config，不插入 user composer。
- 调用 `canvas_run_nodes` 执行当前阶段；独立依赖链可在一次调用中真实并发，`tail-frame` 链必须等待前镜。轮询 `canvas_get_run_status` 到终态，不得把 UI 同时 loading 当成并发证据。
- 失败或用户要求重跑时调用 `canvas_rerun_outputs` 并保留结果节点 ID；暂停时调用 `canvas_cancel_run`，确认 job 已取消且 MCP 锁已解除。

禁止使用 `canvas_generate` 和 `canvas_generate_batch`；禁止绕过节点运行时直接请求 Runware、火山、BigModel、Speech、H3 或 Suno。

## P1–P10 实施映射

| 阶段 | Canvas MCP 实施 |
|---|---|
| P1 需求与项目 | 同步角色；创建或读取 Canvas；创建 `factoryRunId` 和项目公共输入节点 |
| P2 事实与脚本 | System Text / 输入 Text → Text Config → Text 结果；审核也使用真实 Text Config |
| P3 角色与视觉设定 | Prompt / Reference → Runware Image Config → Image；保存验收状态和稳定资源标识 |
| P4 配音与真实时间线 | 台词 → 语气优化 Text Config → Speech Config → Audio；读取真实 Audio 时长 |
| P5 分镜与 Storyboard | 分镜文字/角色/场景参考 → Image Config → Storyboard Image；建立真实连续性依赖 |
| P6 Pre-roll 确认 | 故事线/分镜/Storyboard/风格 → 核心点 Text Config → 场景脚本 Text Config → Preview Prompt Config → MiniMax H3 Config → Pre-roll Video；确认用不连线 Comment |
| P7 H3 Prompt | 模式 System Text + 分镜文字/图片/音频 → Text Config → H3 Prompt Text |
| P8 H3 视频 | 最终 Prompt + 有序图片/音频 → MiniMax H3 Config → Video；`tail-frame` 使用前镜尾帧真实依赖 |
| P9 验收与定向重做 | `canvas_verify_video_asr`、`canvas_use_video_frames`、实际查看和 `canvas_verify_video_visual`；结论使用不连线 Comment |
| P10 安全合片与交付 | `canvas_merge_videos`；只接受当前验收、有效快照和可合片的正式 Video |

MCP 只能实施当前阶段。即使下游 Config 已存在，也不得在上游门禁未通过时提前运行。P6 未确认时，不得创建或运行正式 P7–P10 Config。P6 的来源、中间产物、确认和反馈回流始终以[Pre-roll 确认规范](Pre-roll确认规范.md)为准。

## System Prompt 与输入快照

System Prompt 是可见、可编辑的普通 Text 节点，使用 `promptRole: system`、稳定 `templateKey`、`templateVersion` 和布局 metadata。可以默认锁定；用户解锁后可编辑、替换或删除。修改后不得静默改变旧结果；对比结果 `inputSnapshot.systemPromptSha256` 并使不一致结果过期。

H3 Prompt 的图片/音频标签顺序必须与 composer 中 `@[node:ID]` 顺序一致；确定性 `audio_references` 写在 H3 Video Config 的 composer 中，不交给模型猜测。

## 验收与合片

首、中、尾帧使用 `canvas_use_video_frames`，不得另写抽帧脚本。PASS 前实际查看三个 Image 节点及连续镜头对；Comment 只记录结论，不参与连接。合片必须通过源 SHA-256、完整解码和拼接前后 PCM SHA-256 校验。
