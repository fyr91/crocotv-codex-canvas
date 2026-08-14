# Croco Video Factory 现有规范迁移矩阵（审阅草案）

> 状态：**已由用户确认并在 Plugin 0.1.2 实施**。本文保留为规范迁移与回滚依据。
> 流程基线：[P1–P8 整体流程重构](video-factory-P1-P8-flow-redesign-review-draft.md)
> Prompt 基线：[Prompt 资产复用与缺口清单](prompt-asset-reuse-and-gap-inventory.md)
> 能力基线：[Script / MCP / Canvas 原子能力审计](video-factory-P1-P8-atomic-capability-audit.md)
> 更新约束：[现有更新 Protocol](video-factory-P1-P8-atomic-capability-audit.md#8-现有更新-protocol)

本文回答三个问题：现有规范中什么必须保留、它在新 P1–P8 中归谁负责、两套执行后端分别需要复用或补齐什么原子能力。其结论已用于 Plugin 0.1.2 实施。

## 1. 本次重构的架构结论

### 1.1 只有一条共享生产流程

P1–P8 只有一套阶段定义、输入输出、模型职责和 Gate。Canvas MCP 与 Skill 原生不是两套流程，而是用户在入口选择的两套**原子能力后端**。

```text
Croco Video Factory SKILL.md
        ↓ 只做入口、模式询问与渐进式路由
执行后端选择规范.md
        ↓ P1–P8 唯一共享流程、阶段 Gate、统一语义产物
        ├─ Canvas MCP 执行规范 + Canvas 节点产物契约
        │    └─ 调取文字 / 图像 / 视频 / 语音 / 音乐 / 资源 / 验证等 Canvas 原子能力
        └─ 原生执行规范
             └─ 调取 Markdown / Script / 文件 / Provider / 验证等原生原子能力

当前阶段
        ↓ 仅加载当前阶段需要的领域规范、Prompt 与验收规则
```

因此以后调整 P1–P8 流程时，只修改一次共享流程；Canvas 与原生文档只维护能力映射、执行约束、状态载体和缺口，不复制一份流程。

### 1.2 Progressive disclosure 沿用现有 Skill 架构

1. `SKILL.md` 保持精简，只说明触发条件、第一轮选择、权威流程入口和何时加载子规范。
2. 用户选择 Canvas 或原生后，才加载对应执行规范。
3. 进入某阶段时，只加载该阶段需要的领域规范；例如 P5 才加载 Storyboard Prompt 与验收规范。
4. 只有真正调用某种原子能力时，才加载该能力的详细规范或子 Skill；例如正式 Speech 才加载情景化语音、角色发声与 DeepSeek 语气分段规则。
5. 跨阶段不复制相同规则；唯一权威文件定义，其他文件只引用或实现。

### 1.3 Canvas 不是“外部改完再塞 Result Text”

Canvas 中凡是 Gemini、GLM、豆包或 DeepSeek 负责生成/审核的文字，必须通过真实节点执行：

```text
上游事实 Text + System Prompt Text
        ↓
指定模型的 Text Config
        ↓ 由 server/canvas-node-runtime.ts 真实运行
模型 Result Text
```

- 人工反馈改变模型负责的内容时，反馈成为新输入并重跑 Config；MCP 不直接改写模型 Result 正文。
- 确定性整理、ID/哈希、资源索引、固定模板组装、Gate 状态等不是模型创作，可由 canonical Canvas command 创建或更新普通 Text。
- 研究、核验和状态查询是动作，不伪装成进度 Text Node；但模型实际消费的研究结论、引用、审核输入必须形成有来源的 Text，模型审核意见必须来自审核 Config 的 Result。
- 图像、视频、语音和音乐同样只在相应阶段通过各自真实 Config → Result 链执行，不在流程文档里预设每阶段都调用全部能力。

## 2. 迁移动作定义与硬边界

| 标签 | 含义 | 实施要求 |
|---|---|---|
| 保留原样 | 现有职责、阶段和规则均正确 | 保持唯一权威，其他文件只引用 |
| 保留核心并迁移 | 规则仍有效，但应归入新阶段或新的权威文件 | 先建立新引用，再移除旧处重复定义 |
| 局部替换 | 核心原则保留，版式、字段或流程口径被用户明确改变 | 明列保留项与替换项，不能整份删除 |
| 阶段重路由 | 能力继续存在，但新流程在不同阶段调用 | 执行脚本/工具不必因阶段编号变化而重写 |
| 降级为按需能力 | 不再是 P1–P8 固定步骤，但在条件满足时仍调用 | 保留规范和入口，由共享流程声明触发条件 |
| 新增缺口 | 当前没有足够的规范、Prompt、validator 或原子能力 | 先补契约，再决定是否改 MCP/Script |
| 待用户确认 | 属于产品政策而非技术事实 | 实施前不得擅自锁定 |
| 删除候选 | 已被新权威完整覆盖且无独立价值 | 必须完成链接、调用方和规则覆盖检查后才可删除 |

硬边界：现有规则只有在“已迁入新唯一权威”“已被用户确认的新政策替代”或“证实为重复且无调用方”时才能删除。文件名过时不等于内容可丢弃。

## 3. 权威文件级迁移总表

| 现有权威文件 | 当前核心职责 | 迁移判断 | 新职责 / 归属 | Canvas / 原生影响 |
|---|---|---|---|---|
| [主 Skill 入口](../../plugins/croco-video-factory/skills/croco-video-factory/SKILL.md) | 固定流程入口、模式选择、按阶段加载 references | 保留核心并瘦身 | 只做入口、路由、强制 Gate 提醒；不承载完整 P1–P8 | 两后端共享，不复制流程 |
| [执行后端选择规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/执行后端选择规范.md) | 固定阶段、Canvas/原生选择、共同语义 | 保留核心并更新为唯一流程权威 | 承载新版 P1–P8、模型调用矩阵、Gate 和统一产物语义 | 两后端共同消费 |
| [Canvas MCP 执行规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/Canvas-MCP执行规范.md) | MCP 工具使用、真实节点运行、Canvas 组织 | 保留原架构，更新能力映射 | 只描述 Canvas 原子能力如何实现共享阶段，不复制 P1–P8 | Canvas 专属 |
| [Canvas 节点产物契约](../../plugins/croco-video-factory/skills/croco-video-factory/references/Canvas节点产物契约.md) | 节点 metadata、来源、状态、快照和布局 | 保留核心并扩展 | 增补新阶段产物类型、模型 Result 不可直改、Gate/approval/source snapshot | Canvas 专属 |
| [原生执行规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/原生执行规范.md) | Markdown、目录、哈希、current 指针、脚本状态 | 保留原架构，更新能力映射 | 只描述原生原子能力如何实现共享阶段，不复制 P1–P8 | 原生专属 |
| [项目初始化规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/项目初始化规范.md) | Topic、受众、方向、角色选择 | 保留核心并扩展 | P1 项目简报、硬约束、资源索引、缺失项；正式角色仍由用户选择 | 两后端语义一致 |
| [内容策划规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/内容策划规范.md) | 事实、主题、脚本、内容审计 | 局部替换顺序并拆责 | P2 改为主题/大纲 → 事实研究 → DeepSeek V4 Pro Gate → 剧本 → GLM 去 AI 化 → 用户锁定 | Canvas 走 Text Config；原生写 Markdown/调用模型 |
| [通识教育视频节奏规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/通识教育视频节奏规范.md) | 单一问题、节拍、信息密度、适龄表达 | 保留核心并迁移引用 | P2 负责叙事节拍；P4 只负责拍摄节奏，不重复内容结构 | 两后端共享领域规范 |
| [Critical Information 审计](../../plugins/croco-video-factory/skills/content-optimization-audit/references/critical-information-audit.md) | 主张、来源、限定条件和风险审计 | 保留核心并重路由 | P2 前置 DeepSeek V4 Pro 事实 Gate 的审核依据；不在后置去 AI 化重复执行 | DeepSeek V4 Pro Config / 原生同模型调用共享语义 |
| [Humanizer 规则](../../plugins/croco-video-factory/skills/content-optimization-audit/references/humanizer-rules.md) | 去 AI 腔、自然表达、避免模板化 | 保留核心并重路由 | P2 后置 GLM 校定；不得新增事实或改变已通过大纲 | 同上 |
| [NPC 角色设计规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/NPC角色设计规范.md) | 新 NPC 的身份、外形、服装、材质、行为与生产一致性 | 保留核心并扩展 | P3 角色总体设计、剧本功能、Variation、声音身份与不变量 | 两后端共享；缺新资产时才调用 Gemini |
| 原三视图基础提示词 | 同一角色多角度、干净参考板、身份一致性 | 已局部替换 | 已迁入[四视图基础提示词](../../plugins/croco-video-factory/skills/croco-video-factory/references/四视图基础提示词.md)：左大半身主图；右正/侧/背全身 | 图像能力不变，Prompt 资产升级 |
| 原三视图验收规范 | 身份、比例、服装、材质、视角、干净度、重试 | 已局部替换 | 已迁入[四视图验收规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/四视图验收规范.md)；保留关键错误、阈值、重试与 best-effort | Canvas/原生验收能力分别实现同一 Rubric |
| [故事场景设计规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/故事场景设计规范.md) | 场景空间、光线、色彩、材质、道具、参考图验收 | 保留核心并替换出图口径 | P3 按锁定剧本确定大场景与道具；每场景默认形成一张综合设定图 | 图像生成与验收能力保留；复杂场景政策待确认 |
| [分镜脚本规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/分镜脚本规范.md) | 剧本覆盖、分镜目的、连续性、引用、Storyboard Prompt | 拆分并重路由 | 文字导演分镜归 P4；Storyboard Prompt/出图归 P5；连续性规则继续跨 P4–P8 | 两后端共享领域规则，不复制成两套分镜流程 |
| [Storyboard 基础提示词](../../plugins/croco-video-factory/skills/croco-video-factory/references/Storyboard基础提示词.md) | 固定 Storyboard 画板视觉约束 | 保留核心并更新输入契约 | P5 固定模板，接收 P4 分镜文字、P3 四视图/场景综合图 | 标准模式 GPT Image 02；快速模式 Nano Banana Lite |
| [Storyboard 验收规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/Storyboard验收规范.md) | 脚本覆盖、格数、构图、动作、连续性、重试 | 保留核心并更新引用 | P5 验收；引用由三视图/旧场景图改为四视图/综合场景图/Variation | 两后端同 Rubric、不同状态载体 |
| [H3 视频生成规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/H3视频生成规范.md) | H3 模式、受管理 System Prompt、引用顺序、正式视频链 | 保留核心并阶段重路由 | P6 生成并锁定正式 H3 Prompt；直接进入 P8 生成并做统一综合评估闭环 | Canvas runtime 与原生脚本继续复用 |
| [MiniMax H3 Prompt Optimizer](../../plugins/croco-video-factory/skills/minimax-video-prompt-optimizer/SKILL.md) | H3 模式路由、Prompt 结构和约束 | 保留原样并按需加载 | 只在 P6 H3 Prompt 形成时加载 | 两后端共享领域子 Skill |
| [P8 视频综合评估规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/P8-视频综合评估规范.md) | 真实视频的内容、导演实现、连续性、视听与技术质量统一评估 | 新增 | P8 每个正式 Video 生成后由 Codex 直接评估；默认不调用外部模型且不使用视频理解脚本 | Canvas 记录 Comment/metadata；原生保存 Markdown/JSON |
| [情景化语音任务规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/情景化语音任务规范.md) | Voice ID、逐字保真、语气分段、语音生成与验证 | 降级为按需能力 | P3 只锁定声音身份；正式 Speech 阶段未定，规范暂不删除 | Canvas/原生语音能力继续保留，当前 P1–P8 默认不调用 |
| [Character Speaking](../../plugins/croco-video-factory/skills/character-speaking/SKILL.md) | DeepSeek 分段、Seed-TTS、字符级核验与重试 | 保留原样并按需加载 | 正式 Speech 生成时使用 DeepSeek V4 Flash GA 正式版（`deepseek-v4-flash-ga-260731`）；与 P2 Gate 的 DeepSeek V4 Pro 职责隔离 | 两后端需保留等价语音调用入口 |
| [Pull Latest Characters](../../plugins/croco-video-factory/skills/pull-latest-characters/SKILL.md) | 拉取已发布角色、Voice 和资源完整性 | 保留原样 | P1/P3 按需同步资源；不得删除远端缺失但本地已有角色 | 两后端资源能力保留 |
| [经验沉淀规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/经验沉淀规范.md) | 纠错证据、更新既有体系、验证与回滚 | 保留原样 | 作为后续实施 Protocol 的治理约束 | 与生产后端无关 |

## 4. 阶段级核心规则迁移

### P1 — 项目需求与边界

| 必须保留 | 新增/调整 | 新权威位置 |
|---|---|---|
| Topic、目标受众、内容方向、时长、画幅、用户指定正式角色；不得自动替用户选正式角色 | 增加已有角色/Voice/视觉资源索引、硬约束、禁区、模型可补全范围和缺失项 | 共享流程定义 P1 Gate；项目初始化规范定义字段 |

P1 默认不需要外部 LLM。Canvas 可用普通 Text 与资源查询节点/工具；原生可用项目 Markdown 与资源索引 Script。

### P2 — 大纲驱动事实 Gate 与剧本锁定

| 必须保留 | 明确替换 | 新权威位置 |
|---|---|---|
| 单一核心问题、适龄性、事实准确、来源限定、视觉优先脚本、角色功能、无强行 CTA、默认无可见文字、未到导演阶段不写正式镜头/H3 Prompt | 旧“先铺事实依据再做主题”的次序，改为“Gemini 主题分析/大纲 → 定向事实研究 → DeepSeek V4 Pro 事实 Gate”；后置 GLM 只校定/去 AI 化，不重复事实审核 | 内容策划规范 + 节奏规范 + Critical/Humanizer 引用 |

强制链：

```text
Gemini 主题分析与内容大纲
    → 研究与 Claim/source 映射
    → DeepSeek V4 Pro 事实 Gate
        ├─ FAIL：回改大纲并只重验受影响 Claim
        └─ PASS：Gemini 剧本初稿
                    → GLM 表达校定/去 AI 化
                    → Auto/互动均强制用户确认并锁定
```

### P3 — 可生产角色、声音身份、剧本场景与道具

| 必须保留 | 明确替换/扩展 | 新权威位置 |
|---|---|---|
| 角色身份、比例、服装、材质和行为不变量；已有角色优先复用；Voice ID/参考音色；场景空间、灯光、色彩、材质、道具锚点；原生画幅；无文字/Logo/水印；验收、重试和 current 指针 | 叙事角色扩展为角色总体设定、剧本功能、Variation、声音身份；三视图改四视图；零散场景角度图改为按剧本场景的一张综合设定图 | NPC、四视图、场景设计、验收规范 |

P3 不拆 Storyboard Unit、不建立独立连续性矩阵。只有存在缺失或实质改造资产时，Gemini 才执行一次综合创意设计；图片由图像原子能力生成。

### P4 — 导演总纲与正式文字分镜

必须迁入并保留：剧本全覆盖、每个分镜先定义叙事/信息目的再决定摄影、按信息与状态变化拆并、稳定 `shotId`、`storySegmentId`、`sceneId`、`independent / soft-continuity / tail-frame` 依赖、角色/场景/道具引用、视线/运动/持物/光线/声音连续性。

P4 新口径：

- 全片公共列只定义导演拍摄相关的视觉、色彩、光线、材质、构图、镜头语法、节奏、表演、人物/环境动态和声音导演规则；不重复 P3 四视图与场景资产。
- 正式拆分单位是单个 Storyboard Unit/文字分镜，不按场景拆，也不叫“镜头设计卡”；一个分镜可以跨场景。
- 每个分镜包含剧本片段、呈现目标、场景、角色状态/Variation、交互动作、情绪、动效、镜头语言、机位、景深、运镜、环境动效、音乐、环境音、音效和后续 Prompt 约束。
- Gemini 负责一次 P4 阶段创作（上下文过长时可批次）；GLM 在全片完成后只做一次跨分镜总审。

### P5 — Storyboard Prompt、图像和验收

保留固定黑白 Storyboard 画格、彩色技术标记、画格数量自适应、剧本覆盖、构图/动作/连续性、引用排序、原生画幅、不得依赖后裁切等规则。P4 不再生成 Storyboard Prompt；P5 用确定性模板组装，标准模式调用 GPT Image 02，用户选择快速模式时调用 Nano Banana Lite。现有 85 分、关键错误、最多五次和 best-effort 机制先保留为现状，是否调整列为待用户确认。

### P6 — 正式 H3 Prompt 锁定

保留统一 Ref2VA 六段式 System Prompt、原对白/画面文字逐字保真、引用标签和连接顺序一致、source hash/input snapshot、tail-frame 依赖、原生构图与时码结构。真实音频 Reference 在豆包输入前按顺序绑定并写入官方六字段，不追加第七字段。豆包 Seed 2.1 Turbo 直接形成 P6 最终 Prompt并锁定；P6 不运行 Prompt validator，也不调用外部审核或格式修订模型。

### P7 — 已取消

不再创建 Trailer Prompt、Preview、独立列或用户 Gate；P6 直接进入 P8。

### P8 — 正式 H3 分镜生成

保留真实 H3 生成、依赖调度、并发、取消、重跑、输入快照、结果版本和 tail-frame 链。P8 生成后由 Codex 直接查看真实视频并做统一综合评估；生成或技术瑕疵只重生成当前片段，只有承载/拆分问题才回 P6 延长、拆分或扩展，优先从场景切换/不连续边界拆分，不改 P4 规划。

旧有视觉/对白验证、安全合并、失效传播等规则不应删除，只是当前 P1–P8 范围暂不执行，应保留给后续阶段设计。

## 5. Canvas MCP 原子能力映射（不是第二条流程）

| 原子能力类别 | 现有可复用能力 | 新 P1–P8 用法 | 缺口 / 需审计 |
|---|---|---|---|
| 服务与项目 | `canvas_start_local_service`、`canvas_get_service_status`、`canvas_create_project`、list/get project | P1 创建/打开项目，承载统一阶段状态 | 项目阶段 metadata 是否足够表达新 Gate |
| 普通 Text / 图结构 | `canvas_apply_operations`、`canvas_query_nodes`、连接和 canonical command | 创建输入、确定性摘要、索引、Gate 记录和布局 | 需确认是否已有受约束的批量阶段图构建，避免大量零碎调用 |
| 分镜列组织 | `canvas_upsert_shot_column`、`canvas_relayout_shot_columns` | P4 后按正式 `shotId` 建列；P5–P8 在同一列追加真实产物 | 当前字段是否支持 P4/P5/P6/P8 分层与跨场景分镜 |
| 文字模型 | Text/System Text/Video → Text Config → `canvas_run_nodes` → Result Text | P2/P4/P6 的关键外部模型调用；P8 默认由 Codex 直接评估，不建 Config | 需要受管理 Prompt key/version/hash 与模型 Result 不可直改约束 |
| 图像生成 | Image Config → runtime → Image Result；资源输入与连接 | P3 四视图/综合场景图，P5 Storyboard | 四视图和综合场景图模板、metadata、Rubric 与重试契约需升级 |
| 视频生成 | Video Config → runtime → Video Result；run/status/cancel/rerun | P8 正式 H3 | 记录目标/实测时长，并绑定 Codex 综合评估记录 |
| 语音生成 | Canvas runtime 已有语音能力、角色 Voice 资源 | 当前 P3 仅绑定声音身份；正式 Speech 阶段按需 | 正式 Speech 阶段未定，不在 P1–P8 强行调用 |
| 音乐生成 | Canvas runtime 的 Suno 能力 | 当前 P4 只写音乐导演规则，后续真正需要音乐时调用 | 生成阶段与产物 Gate 未定 |
| 角色/资源 | list/sync characters、list/import resources、use video frames | P1/P3 复用角色、Voice、参考图；P6/P8 绑定媒体 | 必须继续统一资源树、允许根目录和敏感信息保护 |
| 验证 | video ASR、visual verify、状态查询 | 后续正式验证；P5/P3 可记录 Rubric 但不能伪装自动视觉结论 | 四视图/场景/Storyboard 是否需要专用 deterministic schema 待设计 |
| 视频合并 | `canvas_merge_videos` | 当前 P1–P8 不调用 | 能力保留，不因当前范围停止而删除 |
| 兼容旧生成工具 | `canvas_generate`、`canvas_generate_batch` | 不用于新流程 | 继续标为 legacy/prohibited；不得绕过 Config 图 |

所有 Canvas 写入和执行继续遵守 `server/canvas-commands.ts`、`server/storage.ts`、`server/canvas-events.ts` 与 `server/canvas-node-runtime.ts` 的 canonical path。是否修改 MCP 不能从“流程文字变了”直接推断；只有节点/metadata/端口/运行参数/结果形态/远程能力发生变化时才改权威 MCP，并按 parity rule 验证。

## 6. Skill 原生原子能力映射（不是第二条流程）

| 原子能力类别 | 现有可复用能力 | 新 P1–P8 用法 | 缺口 / 需审计 |
|---|---|---|---|
| 项目与 Markdown 状态 | `创建视频项目.mjs`、原生目录/文件/current/hash 规则 | P1 初始化；P2–P8 写阶段 Markdown、锁定版本和审批快照 | 新 P1–P8 文件命名、frontmatter/schema 和 Gate 指针需定义 |
| 角色与时长 | `角色与时长.mjs` | P1/P3 资源解析和预算辅助 | 不应承担创作或替用户选正式角色 |
| 文字模型调用 | Codex 原生模型能力 + 受管理 Prompt/外部 Provider 通道 | 仅调用矩阵规定的 Gemini、GLM、豆包、DeepSeek | 需要与 Canvas 同语义的 Prompt version/hash 和 Result 历史契约 |
| 角色参考图 | `生成NPC四视图.mjs`、`记录图像验收.mjs` | P3 四视图生成与验收 | Script/模板/文件名已升级为四视图，保留重试、历史兼容计数和 current |
| 场景参考图 | `生成场景设计图.mjs`、`记录场景设计验收.mjs` | P3 每剧本场景综合设定图 | 输入输出和验收需支持一图多角度整合口径 |
| Storyboard | `生成分镜图.mjs` + Storyboard 模板/验收 | P5 从锁定 P4 文字分镜组装 Prompt 并生成 | 需更新四视图、综合场景图、Variation 引用契约 |
| H3 Prompt | `生成H3提示词.mjs` + H3 规范 + Prompt optimizer | P6 正式 Prompt 与生成片段化 | 新增目标时长、`generationSegmentId` 和 lock snapshot |
| H3 视频 | `生成H3分镜视频.mjs`、`h3-client.mjs` | P8 正式分镜 | 增加实测时长与视频理解 Result；P7 不执行 |
| 视觉/对白验证 | `验收H3视觉.mjs`、`火山ASR.mjs`、`验收H3对白.mjs` | 保留给后续正式验收 | 当前 P1–P8 结束点不调用，不删除 |
| 合并 | `合并H3分镜视频.mjs` | 保留给后续合片 | 当前 P1–P8 不调用，不删除 |
| 语音 | Character Speaking scripts / runtime | 正式 Speech 阶段按需：DeepSeek 分段 → Seed-TTS → 字符级验证 | 阶段归属待用户确认；P3 只保存声音身份 |
| 资源同步 | Pull Latest Characters scripts | P1/P3 按需拉取已发布角色与 Voice | 继续遵守不删除本地已有角色和令牌保护 |

原生后端可以使用 Markdown、文件、脚本和 Provider 客户端，不需要模拟 Canvas 节点；但输出语义、Prompt 版本、source/input hash、Gate 和用户确认必须与共享流程一致。

## 7. 拟实施文件变更包

以下只是获批后的变更范围，不代表现在执行。

| 优先级 | 文件/资产 | 拟变更 | 不应做的事 |
|---|---|---|---|
| 1 | `references/执行后端选择规范.md` | 写入唯一新版 P1–P8 阶段表、模型矩阵、Gate 和两后端共同语义 | 不写两套后端流程 |
| 2 | 主 `SKILL.md` | 更新简短流程摘要、强制 Gate、渐进式加载路由 | 不塞入全部阶段细节 |
| 3 | 内容、角色、场景、分镜、Storyboard、H3 与视频一致性 references | 按第 3–4 节保留核心、迁移职责、消除重复 | 删除已取消 P7 的可执行规范，历史项目数据不动 |
| 4 | Prompt/System Prompt/Rubric 资产 | 按 [Prompt 清单](prompt-asset-reuse-and-gap-inventory.md) 新建、版本化或升级 | 不静默覆盖旧结果使用的模板版本 |
| 5 | `Canvas-MCP执行规范.md`、`Canvas节点产物契约.md` | 更新原子能力映射、stage metadata、Result/approval/source snapshot 契约 | 不复制 P1–P8 流程正文 |
| 6 | `原生执行规范.md` | 更新 Markdown/Script/文件状态映射 | 不复制 P1–P8 流程正文 |
| 7 | 原生 scripts | 只改已确认的四视图、场景综合图、锁定快照、预估时长与 P8 一致性能力缺口 | 不把流程政策硬编码到多个脚本 |
| 8 | MCP/server/node runtime | 仅在能力审计证明现有 typed tool 或 metadata 无法表达需求时修改 | 不创建旁路 provider 调用，不直接改 project.json |
| 9 | 版本与分发 | 实施完成后同步版本并构建生成 bundle manifest | 不修改全局/cache 安装副本 |

### 明确保留、不列为删除候选

- 两后端选择与 Auto/互动模式选择；
- canonical Canvas command/runtime/event/storage 路径；
- 角色同步、Voice、语音、音乐、视频验证和合并能力；
- H3 五模式受管理 System Prompt 与引用顺序；
- 角色/场景/Storyboard 的一致性、验收、重试、current 指针和历史；
- source hash、input snapshot、approval snapshot、失效传播与安全合并思想；
- 内容事实审计、Humanizer、适龄性和教育节奏规则；
- 经验沉淀、版本同步、MCP parity、验证和回滚规范。

当前没有任何现有 reference、sub-skill 或 script 被批准删除。

## 8. 实施验证与回滚要求

获批实施后至少执行：

1. 检查 `SKILL.md` → 共享流程 → 后端规范 → 当前阶段领域规范的链接与单一权威关系。
2. 对每条旧核心规则做覆盖检查，确认有新归属或用户批准的替代规则。
3. 校验 Canvas 模型文字链确实为 Input/System → Config → runtime → Result；人工修改触发重跑，不直改 Result。
4. 校验原生与 Canvas 对同一阶段产出相同语义字段、Gate 和 source/input/approval snapshot。
5. Skill 执行 `quick_validate.py`、`plugin-eval analyze`，有基线时执行 compare。
6. 若修改项目或 MCP，执行仓库要求的 build、REST command、MCP client list/call、Canvas live sync、项目版本增量与浏览器延迟保存竞态验证。
7. 生成能力验证走真实 Canvas/MCP 或原生正式路径；除非用户批准，不进行付费生成。
8. 回滚以单次审核包为边界，恢复旧 Skill/references/scripts/MCP 和同步版本；历史 Prompt 版本与用户项目数据不删除。

## 9. 待用户确认

1. **P3 图片 Gate**：四视图和场景综合设定图是否必须逐项人工确认后才能进入 P4，还是 Auto 模式可由 Rubric 自动通过、仅关键失败停住。
2. **四视图重试政策**：现有 85 分、关键错误、最多五次、best-effort 是否原样保留。
3. **场景综合图政策**：固定版式如何定义；复杂场景达到什么条件时允许拆成多张。
4. **P5 Storyboard Gate**：是否每个 Storyboard 都要人工确认，或只在互动模式/低分/关键错误时暂停。
5. **P6 锁定 Gate**：模型 Result 形成后是否需要用户确认；当前只有 P2 剧本保持全模式强制人工 Gate。
6. **正式 Speech 的阶段归属**：当前 P1–P8 只在 P3 锁定声音身份；正式语音生成、DeepSeek 语气分段和 Seed-TTS 应放入后续哪个阶段。
7. **P8 之后的旧能力归属**：建议暂时保留视觉/对白验收、修复、合片和交付规范，待下一轮定义 P9/P10，而不是现在删除；请确认。
8. **模型具体型号政策**：P2 Gate 锁定 DeepSeek V4 Pro；H3 Prompt 锁定豆包 Seed 2.1 Turbo，不再使用外部审核模型；Speech 语气分段锁定 DeepSeek V4 Flash GA 正式版并开启 thinking；Gemini/GLM 具体型号是否继续保持可配置。

本轮未明确的产品政策继续沿用既有默认或保持未启用；后续如改变，应再次按更新 Protocol 审核，不在实施中静默补充。
