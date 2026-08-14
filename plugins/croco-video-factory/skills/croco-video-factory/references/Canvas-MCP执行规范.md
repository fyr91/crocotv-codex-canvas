# Canvas MCP 原子能力执行规范

## 边界

本文件只说明 Canvas 如何执行[P1–P8 流程](执行后端选择规范.md)。Text、Image、Audio、Video、Config、Group 和 Comment 必须参与真实执行或保存真实产物；不得创建进度示意节点。

所有非 UI 写入使用 canonical Canvas command；所有 Canvas Provider 生成由 `server/canvas-node-runtime.ts` 运行真实 Config。禁止直接请求 Provider 后把结果塞回 Canvas，禁止使用 legacy `canvas_generate` / `canvas_generate_batch`。唯一额外图像来源是用户指定 GPT 时的[Canvas 内置 ImageGen 落图操作](Canvas-ImageGen落图操作规范.md)；它必须标记为导入生成资产，不伪装为 Config Result。

## 启动、项目与资源原子能力

1. 用户指定启用 Canvas 后，在首次 MCP 调用前立即运行 `node <skill-root>/scripts/公共/启动本地Canvas.mjs`。脚本直接并行检查 API/Web：均就绪时立即返回，只启动缺失的服务；失败时报告错误与日志路径，不得绕过 Canvas 切换到原生后端。`canvas_start_local_service` 保留给脱离 Skill 的独立 MCP 使用。
2. 读取用户指定 Canvas；未指定时只在 P1 输入确认后创建。用稳定 `factoryRunId` 隔离本次生产，不清空既有内容。
3. 按需调用 list/sync characters、list/import resources；正式角色只能使用用户点名项。
4. 用 `canvas_query_nodes` 按 `factoryRunId`、`shotId`、`stage`、`artifactType` 查询子集。

## 图构建、运行与重跑

- 项目级产物用 `shotId: project`；P4 确立正式分镜后，每个 `shotId` 使用一个 shot column。同一 P4 分镜因 P6 拆分产生的多个 `generationSegmentId` 仍放在同一列，不创建伪分镜列。
- 通过 `canvas_apply_operations` 或 `canvas_upsert_shot_column` 原子创建/更新节点、连接与布局；用 `canvas_relayout_shot_columns` 整理已有列。
- 内置 ImageGen 已交付工作区图片时，使用 `canvas_place_imagegen_result` 导入资源并原子建立 Prompt/Reference → imported Image 来源图；不要分别手工调用资源导入和通用 operations 拼 metadata。
- 调用 `canvas_run_nodes` 执行当前 Config，轮询 `canvas_get_run_status` 到终态。独立链可并发，`tail-frame` 链等待前镜。
- 重跑使用 `canvas_rerun_outputs` 并保留结果历史；暂停使用 `canvas_cancel_run`。

## 文字原子能力

只有共享模型矩阵规定的 Gemini、GLM、豆包或 DeepSeek 调用才创建 Text Config：

```text
用户/上游事实 Text + System Prompt Text
        ↓ 真实连接
指定 Provider/Model 的 Text Config
        ↓ canvas_run_nodes
模型 Result Text
```

- System Text 使用 `promptRole: system`、`templateKey`、`templateVersion` 和内容 SHA-256；只连接 Config，不混入 user composer。
- user 输入节点用真实连接和 `@[node:ID]` 顺序引用。
- 审核也必须是独立审核 Config → Result。审核发现问题时，把审核 Result 与人工反馈连接到负责修订的 Config 并重跑；MCP 不直接修改模型 Result 正文。
- P6 只使用一个逐字保存 [H3-Ref2VA-System-Prompt.txt](H3-Ref2VA-System-Prompt.txt)完整内容的 `promptRole: system` 节点，不得 trim、拼接其他 System Text、把 runtime brief 混入其中或在 Config 参数中追加隐式 systemPrompt。链路为 runtime brief/有序引用/目标生成时长 → 豆包 Config → 正式 Prompt Result。Result 不再经过 Prompt validator 或事后格式修订；MCP 不修改 Result 正文。
- P8 默认由 Codex 按[视频综合评估规范](P8-视频综合评估规范.md)直接查看实际 Video，并读取 P2/P4/P6 节点内容和输入快照。评估是动作，不建立 Text Config/Result，也不把 MCP 外完成的评估冒充模型 Text Node；最终结论使用既有 Comment/metadata 保存来源哈希、时间证据、问题归因和总评。只有用户明确指定外部视频理解模型时，才建立实际 Video/规划输入 → 用户指定 Text Config → Result 的真实链。`revise-p6` 时把评估记录作为可追溯反馈连接/引用到新的豆包 Config，生成新版本 Prompt；不得覆盖旧 Result。
- 项目简报、资源索引、ID/哈希、固定模板组装与锁定状态属于确定性 Text，可由 canonical command 更新，但必须记录来源和版本。
- 研究/验证动作不创建“正在研究/正在验证”节点；研究结论与引用在被模型消费前形成输入 Text。

## 媒体原子能力

| 能力 | 真实链 | P1–P8 调用点 |
|---|---|---|
| 图像 | 内置落图：Prompt/Reference → imported Image；Canvas 生成：Prompt/Reference → Image Config → Image Result | P3 和普通新图默认 `google:nano-banana@2-lite`；普通任务指定 GPT 时内置 ImageGen 优先；P5 Storyboard 标准模式默认 `openai:gpt-image@2` 节点链，快速模式用 Lite；图片修改默认 Lite |
| 视频 | Prompt/有序媒体 → MiniMax H3 Config → Video Result | P8 正式分镜生成片段 |
| 语音 | 台词/Voice/指导 → Speech Config → Audio Result | 当前只保留能力；正式 Speech 阶段启用时调用 |
| 音乐 | 音乐 Brief → Suno Config → Audio Result | P4 只锁定音乐导演规则；后续正式音乐阶段启用时调用 |
| 视频综合评估 | Codex 直接查看实际 Video + P2/P4/P6 → Comment/metadata 评估记录 | P8 默认执行统一综合评估；按归因重生成、回流 P6 或停止上报；不创建评估 Config |
| 专项验证 | ASR、视频帧、人工追加复核 | P8 之后按用户需要调用，不重复默认综合评估 |
| 合并 | 当前有效正式 Video → merge | 保留给后续；P8 一致性通过仍不代表已完成 ASR/人工视觉验收 |

图片/音频标签顺序必须与 composer 中媒体节点顺序一致。音频 `<Audio N>` 的身份、用途和顺序由执行层先按真实节点连接确定，再写入豆包 runtime brief；豆包把它们纳入官方六字段，禁止在 Result 后追加 `audio_references:` 第七字段，也不让模型猜测。

Croco Video Factory 的自动图像路由不使用 `google:4@1`，但 Canvas runtime 保留所有可用模型供用户直接操作。普通任务指定 GPT 时，先按独立 ImageGen 落图操作建立 Prompt Text → imported Image 连线；超时/失败或用户指定画布生成时，改走 GPT Image 02 Config 真实链。修改已有图片时保留原 Image，并把它作为新 Image 或 Config 的有序 Reference；不覆写原结果。

## 阶段到能力的最小映射

| 阶段 | Canvas 原子能力组合 |
|---|---|
| P1 | 项目/角色/资源查询 + 确定性普通 Text |
| P2 | Gemini Text Config → 研究输入 Text → DeepSeek V4 Pro Gate Config → Gemini 剧本 Config → GLM 校定 Config → P2 approval |
| P3 | 确定性需求 Text；缺资产时 Gemini 设计 Config；默认 Nano Banana Lite Config/Result；用户指定 GPT 时优先 Prompt → ImageGen imported Image，必要时回退 GPT Image 02 Config/Result；图片验收记录 |
| P4 | Gemini 导演策划 Config；按正式 shot column 保存 Result；GLM 跨分镜审核 Config；受影响分镜由 Gemini 重跑 |
| P5 | 确定性 Storyboard Prompt Text + Reference → GPT Image 02 Image Config/Result（快速模式为 Nano Banana Lite）→ 验收记录 |
| P6 | Ref2VA 通用 System Text + runtime brief/有序媒体 → 豆包 Text Config/Final Prompt → lock |
| P8 | P6 Prompt + 有序媒体/必要前镜尾帧 → H3 Config/Video → Codex 直接综合评估 → Comment/metadata 记录；`regenerate` 重跑当前 H3 Config，`revise-p6` 只建立新的 P6 拆分/扩展 Config 并重跑受影响链 |

## MCP parity 判断

流程文字或阶段编号变化本身不要求新增 MCP 工具。P8 综合评估由 Codex 执行动作，现有 Video 查询、`canvas_apply_operations`、Comment、shot column 与自由 metadata 已能表达 `generationSegmentId`、目标/实测时长、证据、归因和总评，因此本次不新增 MCP 工具、节点类型或端口。只有后续需要把综合评估提升为新的强类型服务状态时，才修改权威 MCP schema。

P8 Video 记录 `previewOnly: false`、`targetDurationSeconds`、媒体探测得到的 `actualDurationSeconds`、P6 input snapshot 和综合评估记录 ID/哈希。P8 总评通过前不得锁定；安全合片仍属于后续流程。
