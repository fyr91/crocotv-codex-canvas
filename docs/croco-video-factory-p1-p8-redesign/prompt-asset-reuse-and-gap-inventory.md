# Croco Video Factory P1–P8 Prompt 资产复用与缺口清单（审阅草案）

> 状态：实施基线；P2/P3/P4/P8 新 Prompt 与 P3/P5 模板已在 Plugin 中落地，本文保留为资产台账。
> 上游流程：[P1–P8 前期策划流程重设计草案](video-factory-P1-P8-flow-redesign-review-draft.md)
> 模型策略：[旧流程模型落点与新流程调用矩阵](video-factory-P1-P8-flow-redesign-review-draft.md#33-旧流程模型落点与新流程调用矩阵)
> 后续变更：[现有更新 Protocol 与实施顺序](video-factory-P1-P8-atomic-capability-audit.md#8-现有更新-protocol)
> 范围：盘点 Prompt、System Prompt、审核 Rubric 与生成约束；正式资产以 Plugin references 为准。

## 1. 统一使用规则

1. **Canvas 模式**：只有模型调用矩阵明确指定的 Gemini、GLM、豆包或其他外部模型调用，才走 `输入 Text / System Text → Config → Canvas runtime → 结果 Text`。MCP 不得在 Canvas 外完成模型生成后再注入结果节点。
2. **原生模式**：使用相同 Prompt 语义，产物写入项目 Markdown；不能因后端不同改变阶段输入、Gate 或最终口径。
3. **最少外部调用**：确定性整理、字段映射、模板组装、资源绑定、哈希、状态和 Gate 记录由 Codex / Script / MCP 完成，不为每个 Text 产物额外调用模型；H3 Prompt 不另运行内容 validator。
4. **版本化**：实际 System Prompt 应保存稳定 `templateKey`、`templateVersion` 和内容哈希。规范文档不是可直接运行的 System Prompt，须先整理成模板。
5. **缺失资产**：本表中的“待新建”只是建议资产，不代表已经存在；对应详情可通过表内链接跳转。
6. **阶段分工**：Gemini 承担 P2/P3/P4 关键创意生成；Codex 在 P2 调研中直接完成 source verification 与事实 Gate；GLM 只承担 P2 后置剧本校定与 P4 一次跨分镜总审；豆包 Seed 2.1 Turbo 生成 P6 正式 H3 Prompt；P8 由 Codex 直接做视频综合评估，默认不外调；DeepSeek V4 Flash GA 只在后续正式 Speech 中做语气分段。

当前 runtime 可选型号包括 Gemini 3.1 Pro / 3 Flash / 3.1 Flash Lite、GLM-5.2 / GLM-5V，以及 DeepSeek V4 Flash GA / Pro。DeepSeek V4 Pro 不再固定绑定 P1–P8，仍保留给用户直接操作；P6 H3 Prompt 由豆包 Seed 2.1 Turbo 直接生成且不另运行 Prompt validator；P8 默认由 Codex 直接查看真实 Video，runtime 保留的模型只在用户明确指定时使用。P7 已取消。正式 Speech 语气分段继续使用 Flash 正式版，但使用独立任务。

## 2. 状态定义

| 状态 | 含义 |
|---|---|
| 直接复用 | 内容和阶段职责一致，可作为稳定模板继续使用 |
| 优化后复用 | 核心规则有效，但输入输出、阶段顺序或角色分工需要调整 |
| 拆分复用 | 当前文档混合多个职责，应拆成独立模板后分别调用 |
| 替换 | 当前资产与新流程冲突，不应继续作为该步骤主模板 |
| 新增 | 当前没有对应 Prompt 或审核模板 |

## 3. 总表

| 阶段 | 工作单元 | 现有可用资产 | 结论 | 需要形成的 Prompt 资产 | 默认执行方式 |
|---|---|---|---|---|---|
| P1 | 项目输入标准化 | [项目初始化规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/项目初始化规范.md) | 优化后复用 | [P1 项目简报标准化](#p1-project-brief) | Codex / schema，不调用外部 LLM |
| P1 | 需求完整性检查 | 项目初始化规范中的必填项 | 新增 | [P1 项目需求完整性审核](#p1-requirement-audit) | deterministic validator / 用户补充 |
| P2 | 主题分析 + 内容大纲 | [内容策划规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/内容策划规范.md) + [通识教育视频节奏规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/通识教育视频节奏规范.md) | 合并并优化复用 | [P2 主题分析](#p2-theme-analysis) + [P2 内容大纲](#p2-content-outline) | Gemini 一次调用 |
| P2 | 按大纲建设事实依据 | 内容策划规范当前“先事实、后主题”顺序 | 替换 | [P2 大纲驱动事实依据](#p2-evidence-build) | Codex 研究工具 + 确定性 Claim/source 记录 |
| P2 | 事实依据 Gate | [Critical Information 审计规则](../../plugins/croco-video-factory/skills/content-optimization-audit/references/critical-information-audit.md) | 规则复用，不再需要独立 System Prompt | [P2 Codex 调研事实 Gate](#p2-evidence-gate) | Codex source verification |
| P2 | 剧本初稿 | 内容策划规范“视频脚本初稿” | 优化后复用 | [P2 剧本初稿生成](#p2-script-draft) | Gemini |
| P2 | 剧本校定、去 AI 化 | [Humanizer 加固规则](../../plugins/croco-video-factory/skills/content-optimization-audit/references/humanizer-rules.md) | 优化后复用 | [P2 GLM 剧本校定与去 AI 化](#p2-script-humanize) | GLM |
| P2 | 剧本锁定前检查 | 无独立模板 | 新增 | [P2 剧本锁定 Gate](#p2-script-lock) | validator + 用户，不再调用 GLM |
| P3 | 角色/场景/道具需求提取 | NPC 与场景规范 | 优化后复用 | [角色需求](#p3-character-needs) + [场景道具需求](#p3-scene-prop-needs) | Codex / schema，不调用外部 LLM |
| P3 | 角色总体设定、Variation、声音、场景创意设计 | NPC、语音、场景规范 | 合并并优化复用 | [角色总体设计](#p3-character-master)、[Variation](#p3-character-variations)、[声音](#p3-voice-design)、[场景整合图](#p3-scene-sheet) | 仅缺新资产时 Gemini 一次综合调用；全复用则不调用 |
| P3 | 四视图 / 场景整合图生成 | 三视图与场景规范 | 替换/优化 | [四视图 Prompt](#p3-four-view) + [场景整合图 Prompt](#p3-scene-sheet) | 固定模板 + Nano Banana Lite；用户指定 GPT 时按图像路由规范执行；不额外调用文字模型 |
| P3 | 图片验收 | 三视图/场景验收规范 | 替换/优化 | [四视图 Rubric](#p3-four-view-review) + [场景 Rubric](#p3-scene-sheet-review) | validator + 人工查看；视觉 LLM 只作疑难 fallback |
| P4 | 导演总纲、正式分镜拆解、单分镜设计 | [分镜脚本规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/分镜脚本规范.md) | 合并并优化复用 | [导演总纲](#p4-director-treatment)、[分镜拆解](#p4-shot-breakdown)、[单分镜设计](#p4-shot-design) | Gemini 一次阶段任务；过长才分批 |
| P4 | 跨分镜完整性/连续性总审 | 分镜脚本规范的脚本覆盖、连续性规则 | 新增独立调用 | [P4 全片分镜审核](#p4-shot-audit) | GLM 整阶段一次，不逐分镜调用 |
| P5 | Storyboard Prompt | [Storyboard 基础提示词](../../plugins/croco-video-factory/skills/croco-video-factory/references/Storyboard基础提示词.md) + 分镜脚本规范第 6 节 | 优化后复用 | [P5 Storyboard Prompt 组装](#p5-storyboard-compose) | Codex / Script 固定组装 |
| P5 | Storyboard 生成与验收 | [Storyboard 验收规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/Storyboard验收规范.md) | 优化后复用 | [P5 Storyboard 审核](#p5-storyboard-review) | 标准模式 GPT Image 02；快速模式 Nano Banana Lite；validator / 人工验收，不默认 Gemini/GLM |
| P6 | H3 正式镜头 Prompt | [Ref2VA 通用 H3 System Prompt](../../plugins/croco-video-factory/skills/croco-video-factory/references/H3-Ref2VA-System-Prompt.txt) | 统一复用 | [P6 运行时 Brief](#p6-runtime-brief) | 豆包 Seed 2.1 Turbo 生成最终六段式 Prompt |
| P6 | H3 Prompt 锁定 | [MiniMax H3 Prompt Writing Skill](../../plugins/croco-video-factory/skills/minimax-video-prompt-optimizer/SKILL.md) | 优化后复用 | [P6 H3 Prompt 锁定](#p6-prompt-lock) | 模型 Result + System/Input snapshot；不运行 Prompt validator |
| P8 | 正式 H3 分镜生成 | P6 已锁定豆包 Result；通用 Ref2VA System 已在 P6 使用 | 不新增创作 Prompt | 运行参数/目标与实测时长/快照契约 | Canvas runtime / H3 |
| P8 | 视频综合评估 | [P8 视频综合评估规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/P8-视频综合评估规范.md) | 新增并直接复用；它是评估 Rubric，不是 System Prompt | [P8 视频综合评估闭环](#p8-video-consistency) | Codex 直接查看真实视频；默认不外调模型、不使用视频理解脚本 |

## 4. 待优化或新增资产说明

### P1

<a id="p1-project-brief"></a>
#### P1 项目简报标准化

- 建议路径：`references/templates/P1-项目简报模板.md`
- 输入：topic、targetAudience、contentDirection、指定角色/NPC、可选 visualStyle、时长与画幅。
- 输出：结构化项目简报、缺失项、显式用户约束；不得自动选正式角色。
- 优化重点：把三行初始化规范扩展成稳定输入/输出契约。

<a id="p1-requirement-audit"></a>
#### P1 项目需求完整性审核

- 建议路径：`references/schemas/P1-需求完整性规则.md`
- 输出：`pass / needs-user-input`、缺失字段、冲突字段；不擅自补产品政策。

### P2

<a id="p2-theme-analysis"></a>
#### P2 主题分析

- 输入：P1 简报与用户指定角色边界。
- 输出：核心问题、记忆点、受众门槛、误解、覆盖边界、候选钩子和叙事路线。
- 优化重点：此步不先要求完整事实库；把“需要事实支持的主张”标成待核验 Claim。

<a id="p2-content-outline"></a>
#### P2 内容大纲

- 输出：连续叙事节拍、知识目的、角色功能、视觉事件、临时时长、依赖关系，以及每个节拍的 `claimIds`。
- 优化重点：保持节奏规范，但不得提前决定导演镜头语言或 H3 Prompt。

<a id="p2-evidence-build"></a>
#### P2 大纲驱动事实依据

- 输入：已选内容大纲及其中的 Claim 清单。
- 输出：逐 Claim 的来源、准确表述、限定词、适用范围、支持状态和受影响大纲位置。
- 优化重点：研究与验证动作本身不是 Text Node；研究结果、引用清单和 Gate 结论作为可追溯阶段输入/状态，供剧本 Config 消费。

<a id="p2-evidence-gate"></a>
#### P2 Codex 调研事实 Gate

- 输出：Codex 在调研中逐 Claim 给出 `pass / partial / fail / conflict`、证据充分性、推论边界、限定条件、Gate 总结与必须回改的大纲位置。
- 循环：失败只返回“内容大纲”修改，再重建受影响事实依据；不进入剧本初稿。
- 约束：沿用 Critical Information 的来源质量规则；不创建外部审核 Config，也不做 Humanizer。Gate 通过后直接调用 Gemini 生成剧本初稿。

<a id="p2-script-draft"></a>
#### P2 剧本初稿生成

- 前置条件：事实依据 Gate 已通过。
- 输出：标题、一句话承诺、角色功能、剧本节拍表、旁白/对白、画面文字边界与结尾。
- 优化重点：每项事实必须可追溯到已通过 Claim；不重新研究、不修改事实。

<a id="p2-script-humanize"></a>
#### P2 GLM 剧本校定与去 AI 化

- 输入：剧本初稿、锁定 Claim、角色语言边界。
- 输出：校定后的最终候选剧本和修改摘要。
- 约束：只处理表达、台词归属、自然度与逻辑衔接；不得再次执行事实依据审核，也不得新增事实。

<a id="p2-script-lock"></a>
#### P2 剧本锁定 Gate

- 输出：锁定候选的结构检查、未决问题及内容哈希。
- 规则：Auto 与手动模式都必须停住，由用户确认后生成 `approvalSnapshot`；后续以该版本为唯一剧本来源。

### P3

<a id="p3-character-needs"></a>
#### P3 角色需求提取

- 输入：锁定剧本、已有角色索引。
- 输出：角色清单、出场依据、是否复用已有资产、缺失资产、剧本功能与优先级。

<a id="p3-character-master"></a>
#### P3 角色总体设计

- 输出：身份、物种/类型、年龄感、体型、外形结构、服装材质、性格、动作习惯、关系、剧本功能和生产不变量。
- 约束：把叙事角色落实为可复用生产资产，不在本步做分镜状态。

<a id="p3-character-variations"></a>
#### P3 角色 Variation 设计

- 输出：Variation ID、触发剧本片段、与总体设定的继承项、允许变化项、服装/状态/表情/小配件，以及禁改项。
- 待用户确认：Variation 是否都要形成独立参考图，还是仅对高频/高风险变体出图。

<a id="p3-voice-design"></a>
#### P3 角色声音设定

- 输出：音色、年龄感、速度、力度、情绪范围、禁区；已有角色绑定 Voice ID 与参考音频，临时角色记录 Voice Prompt。
- 约束：只锁定声音身份，不在 P3 正式生成逐句语音。

<a id="p3-four-view"></a>
#### P3 四视图生成 Prompt

- 固定版式：左侧一张大半身主图；右侧依次为正面全身、侧面全身、背面全身。
- 必须锁定：同一身份、比例、服装、材质、眼线与地线；无额外角色、视图、文字、Logo 或水印。
- 当前三视图固定提示词不能直接沿用。

<a id="p3-four-view-review"></a>
#### P3 四视图审核 Rubric

- 将三视图 Rubric 改为四区版式，并增加左侧主图的脸部/材质识别度、右侧三全身视图完整性与四区身份一致性。
- 保留：关键错误、85 分门槛、最多五次与 best-effort 机制是否继续使用，待用户确认。

<a id="p3-scene-prop-needs"></a>
#### P3 场景与道具需求提取

- 输入：锁定剧本。
- 输出：剧本级 `sceneId`、出现片段、空间功能、固定锚点、灯光/色彩/材质、大道具与小道具、角色交互需求。
- 约束：此处按剧本场景，而不是按 Storyboard Unit 拆场景。

<a id="p3-scene-sheet"></a>
#### P3 场景整合设计图 Prompt

- 目标：每个场景生成一张整合设计图，在同一张图中呈现主空间、必要反向/侧向覆盖、固定道具锚点和材质光线信息。
- 约束：不是 Storyboard；默认空场景；不得出现无关角色、分格编号、文字批注和 Logo。
- 待用户确认：固定整合版式，以及复杂场景允许拆成多张的阈值。

<a id="p3-scene-sheet-review"></a>
#### P3 场景整合图审核 Rubric

- 检查：空间自洽、各视角属于同一场景、灯光方向、色彩材质、道具锚点、镜头覆盖、干净无文字。

### P4

<a id="p4-director-treatment"></a>
#### P4 导演总纲

- 输入：锁定剧本、P3 角色/Variation/声音/场景/道具资产。
- 输出：全片拍摄相关的视觉风格、色彩、光线、材质、画幅构图原则、镜头语言、节奏、表演原则、人物/环境动效原则、声音与音乐整体原则。
- 约束：不重复角色四视图或场景资产设计，不生成 Storyboard。

<a id="p4-shot-breakdown"></a>
#### P4 剧本到分镜拆解

- 输出：正式 `shotId`、对应剧本片段、分镜目的、信息变化、预估生成时长及依据、场景/角色/Variation/道具绑定和连续性关系。
- 约束：一个分镜可跨不同场景；拆分口径是 Storyboard Unit，不是“逐场景设计”，也不叫“镜头设计卡”。

<a id="p4-shot-design"></a>
#### P4 单分镜导演设计

- 每个分镜写全：人物状态/变体、场景与小道具、关键画面方向、情绪与节奏、表演动作、镜头语言、机位、景深、运镜、人物动效、环境动效、音乐、环境音、音效、对白/旁白边界、提示词约束和连续性。
- “关键画面”是文字方向与后续 Prompt 约束，不是正式出图，也不是镜头卡。

<a id="p4-shot-audit"></a>
#### P4 全片分镜审核

- 输出：剧本覆盖、信息遗漏/重复、时长可行性、跨分镜状态、视线/运动/持物/光线/声音连续性、资产引用有效性和回修定位。
- 约束：审核结果通过独立 GLM Config 生成；不得直接改写已生成 Text Node。

### P5

<a id="p5-storyboard-compose"></a>
#### P5 Storyboard Prompt 组装

- 将 Storyboard 固定英文基础提示词与 P4 已锁定的单分镜文字设计、场景整合图、角色四视图/Variation 引用组合。
- 优化重点：Storyboard Prompt 从 P4 移到 P5；P4 不提前生成它。

<a id="p5-storyboard-review"></a>
#### P5 Storyboard 审核

- 保留现有脚本覆盖、格数、构图、动作状态与连续性检查；更新引用契约为“四视图 + 场景整合图 + Variation”。
- 默认使用确定性 Rubric 加人工查看；只有结论不明确时才临时调用支持视觉输入的模型，不把它固化为每次必经调用。

### P6

<a id="p6-runtime-brief"></a>
#### P6 运行时 Brief 组装

- 按单分镜汇总 P4 文字设计、P5 Storyboard、角色/场景/音频引用、H3 模式、时长与连续性，形成传给官方 H3 System Prompt 的 user brief。
- 必须保持引用标签与 Canvas composer 中媒体节点顺序一致。

<a id="p6-prompt-lock"></a>
#### P6 H3 Prompt 锁定

- 不再运行内容 validator；只记录当前模型 Result、System Prompt/Result 哈希、References 和输入快照。
- 锁定表示 P8 消费该版本，不表示额外审核；P8 不得再次改写。

### P8

<a id="p8-video-consistency"></a>
#### P8 视频综合评估闭环

- 输入：真实 Video、P2 锁定剧本片段、P4 文字分镜、P6 Prompt/`generationSegmentId`、目标与实测时长。
- 输出：内容、导演实现、连续性、视听与技术质量各维度证据，以及唯一总评 `pass / regenerate / revise-p6 / blocked-upstream / needs-review`。
- `regenerate` 保持 P6 不变，只重生成当前片段；只有承载或拆分问题才进入 `revise-p6`。
- 拆分优先在场景切换或不连续画面/动作边界，非必要不创建连续依赖；只有无安全断点时才建议 `tail-frame`。

## 5. 优先级建议

| 优先级 | 资产 |
|---|---|
| P0 | P2 事实 Gate、P2 剧本校定/锁定、P4 导演总纲、P4 分镜拆解/单分镜设计、P8 视频综合评估规范 |
| P1 | P3 角色/Variation/声音、四视图生成与验收、场景整合图生成与验收、P6 runtime brief/锁定审核 |
| P2 | P1 标准化与审核、P5 Storyboard 模板重组、各阶段跨产物完整性审核 |

## 6. 待用户确认

1. P3 Character Variation 是否全部生成独立参考图，还是只对高频/高风险 Variation 出图。
2. 四视图和场景整合图在确定性 Rubric 无法得出结论时，是否允许临时启用视觉模型作为 fallback。
3. 三视图现有“85 分、最多五次、失败选 best-effort”政策是否原样迁移到四视图与场景整合图。
4. 复杂场景何时允许由“一张整合图”扩展为多张整合图。
5. P6 Prompt 锁定是否需要用户确认，还是锁定后直接进入 P8；本草案不擅自决定。
