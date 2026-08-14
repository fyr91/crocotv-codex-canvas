# Croco Video Factory P1–P8 原子能力覆盖与缺口审计（审阅草案）

> 状态：实施与验证依据；用户已批准的部分已在 Plugin 0.1.2 落地。
> 上游流程：[P1–P8 前期策划流程重设计草案](video-factory-P1-P8-flow-redesign-review-draft.md)
> 模型策略：[旧流程模型落点与新流程调用矩阵](video-factory-P1-P8-flow-redesign-review-draft.md#33-旧流程模型落点与新流程调用矩阵)
> Prompt 盘点：[Prompt 资产复用与缺口清单](prompt-asset-reuse-and-gap-inventory.md)
> 更新协议：[现有更新 Protocol](#8-现有更新-protocol)
> 审计对象：现有原生 Script、权威 MCP、Canvas 原子命令与统一节点运行时。正式结果以当前 Plugin 权威源和构建产物为准。

## 1. 判断口径

| 结论 | 定义 |
|---|---|
| 已有 | 当前已有可直接完成该动作的原子能力和必要校验 |
| 部分已有 | 底层能做，但缺阶段语义、schema、Gate、快照或专用编排；不能视为完整产品能力 |
| 缺失 | 当前没有安全、可验证的原子能力 |
| 不需新增 | 该步骤只需组合现有原子能力与新 Prompt，不应增加平行执行路径 |

“可以用 `canvas_apply_operations` 写一段 metadata”只算**表达能力**，不等于 Gate、锁定、失效或资产绑定已经被系统强制执行。

## 2. 已有底座

| 底座 | 当前能力 | 结论 | 证据 |
|---|---|---|---|
| Canvas 原子写入 | 一次批量新增/更新/删除节点、连接/断开、改名、视口；版本校验、原子保存和事件发布 | 已有 | [canvas-commands.ts](../../server/canvas-commands.ts)、MCP `canvas_apply_operations` |
| 真实节点生成链 | 解析普通输入 Text、System Prompt Text、图片/视频/音频引用，运行 Config 并创建或原位更新结果节点 | 已有 | [canvas-node-runtime.ts](../../server/canvas-node-runtime.ts)、MCP `canvas_run_nodes` |
| System Prompt | 支持 `promptRole: system` 的 Text Node，并保存 System Prompt 节点 ID 与 SHA-256 | 已有 | [canvas-node-runtime.ts](../../server/canvas-node-runtime.ts) |
| 生成输入快照 | 结果记录 user/system Prompt 哈希、来源节点和有序媒体资源 ID | 已有 | [canvas-node-runtime.ts](../../server/canvas-node-runtime.ts) |
| 异步运行管理 | 批量运行最多 20 个 Config；默认同时启动批次内所有无依赖节点；支持状态查询、取消和原位重跑 | 已有 | MCP `canvas_run_nodes`、`canvas_get_run_status`、`canvas_cancel_run`、`canvas_rerun_outputs` |
| 媒体能力 | Text、Runware 图像模型（包括 Nano Banana Lite、Nano Banana、GPT Image 02）、H3 视频、角色语音、Suno 音乐 | 已有 | [providers.ts](../../server/providers.ts)、[speech.ts](../../server/speech.ts) |
| 本地资源 | 列表、导入、角色同步/列表、Voice ID 与本地资源复用 | 已有 | MCP `canvas_list_resources`、`canvas_import_resource`、`canvas_sync_characters`、`canvas_list_characters` |
| 分镜列 | 原子创建/更新单个 shot-column，统一重排 | 部分已有 | MCP `canvas_upsert_shot_column`、`canvas_relayout_shot_columns`、[canvas-shot-columns.ts](../../server/canvas-shot-columns.ts) |
| 用户 Gate | 规范描述 `approvalSnapshot`，但没有专用写入、校验、撤销与下游拦截命令 | 缺失 | [Canvas 节点产物契约](../../plugins/croco-video-factory/skills/croco-video-factory/references/Canvas节点产物契约.md)仅为文档契约 |
| 阶段失效传播 | runtime 有单次生成 `inputSnapshot`，但没有 P1–P8 阶段依赖图和自动级联失效 | 部分已有 | [canvas-node-runtime.ts](../../server/canvas-node-runtime.ts) |
| 旧直连生成 | MCP 仍暴露 `canvas_generate` / `canvas_generate_batch` | 存在但禁用 | [Canvas MCP 执行规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/Canvas-MCP执行规范.md)明确禁止；新流程不得使用 |

### 2.1 现有模型的真实流程落点

| 模型 | 旧流程中的实际固定职责 | 新 P1–P8 建议 |
|---|---|---|
| DeepSeek V4 Flash GA | [character-speaking](../../plugins/croco-video-factory/skills/character-speaking/SKILL.md) 的正式 Speech 语气分段 | P7 已取消；只在正式 Speech 使用独立任务 |
| DeepSeek V4 Pro | runtime 支持的可选文字模型，旧 Croco 流程没有固定阶段绑定 | 不固定绑定 P1–P8；runtime 保留给用户直接操作 |
| Gemini | runtime 支持文字和真实 Video 多模态输入 | P2 主题+大纲、P2 剧本、缺新资产时的 P3 综合创意设计、P4 导演策划；P8 默认不调用，用户明确指定外部视频理解时才可选用 |
| GLM | runtime 支持的可选文字/视觉模型，旧 Croco 流程没有固定阶段绑定 | 只用于 P2 剧本校定/去 AI 化、P4 一次跨分镜总审 |
| 豆包 Seed 2.1 Turbo | [H3 视频生成规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/H3视频生成规范.md)明确用于生成基础 H3 Prompt | 只用于 P6 正式 Prompt |

模型可被 runtime 选择不等于该阶段必须调用。字段映射、模板组装、资源引用、哈希、状态和 Gate 记录应优先使用 Codex、Script 与 MCP 原子能力；H3 Prompt 不另运行内容 validator。

## 3. P1–P8 逐项审计

### P1 需求与项目初始化

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| 创建原生项目目录与配置 | [创建视频项目.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/公共/创建视频项目.mjs) | `canvas_create_project` 可创建 Canvas 项目 | 已有 | 保留双后端同语义 |
| 读取/更新项目节点 | 原生 Markdown/JSON 可写，但无统一阶段命令 | `canvas_get_project`、`canvas_query_nodes`、`canvas_apply_operations` | 部分已有 | 新增统一 `factoryRunId`、stage、artifactType schema 校验，不增加第二写入路径 |
| 需求标准化与完整性审核 | 无专用 Script | `canvas_apply_operations` 可保存结构化 Text/metadata | 部分已有 | 用 schema/validator 与用户补充完成；不默认调用外部文字模型；需要 `needs-user-input` 状态契约 |
| 角色同步与选择 | 可结合 pull-character 流程 | `canvas_sync_characters`、`canvas_list_characters` | 已有 | 增加“用户指定角色锁定清单”的阶段产物 schema；不得自动挑正式角色 |

### P2 主题、大纲、事实 Gate 与剧本锁定

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| 主题分析 + 内容大纲 | 无专用 Script，依赖 Skill 写 Markdown | Gemini Text Config 可执行 | 部分已有 | 合并为一次关键调用；输出稳定 Claim ID，供事实链引用 |
| 研究与来源采集 | Croco 原生 Script 无网页研究器 | Croco MCP 无研究工具；可由 Codex 外部研究后把结果作为输入节点 | 部分已有 | 不把研究动作伪装成 Text Node；新增“来源/Claim 结果导入”原子契约，是否增加 Croco 内建研究能力待用户确认 |
| 按 Claim 建事实依据 | 无专用 Script | Croco MCP 无研究工具；可保存研究结果节点 | 部分已有 | Codex 研究 + 确定性 Claim/source schema；不再额外调用 Gemini 整理同一批来源 |
| Codex 调研事实 Gate | 无专用 Script；由 Skill 本体执行 source verification | 研究结论可保存为输入 Text，Gate 可用 Comment/metadata 表达 | 部分已有 | 不调用外部审核 Config；保留 `fact-gate` 结果 schema 与 pass/fail 强校验，PASS 后才允许运行剧本 Config |
| Gate 失败回到大纲 | 无 | 可手工新建/重跑节点，系统不强制回路 | 缺失 | 新增阶段 Gate/失效原子能力：失败阻止剧本 Config 运行，修改大纲后只失效受影响 Claim |
| 剧本初稿 | 无专用 Script | Gemini Text Config 可执行 | 部分已有 | 新 Prompt + locked Claim 输入连接检查 |
| GLM 校定与去 AI 化 | [content-optimization-audit Skill](../../plugins/croco-video-factory/skills/content-optimization-audit/SKILL.md)可复用规则，但当前会先做 Critical Information 审计 | GLM Text Config 可执行 | 部分已有 | 拆出 P2 后置专用 Prompt；明确不得重复事实审核 |
| P2 强制用户确认 | 原生模式无统一锁定命令 | 可写 Comment/metadata，但无 `approvalSnapshot` API 与运行拦截 | 缺失 | 新增 `record_stage_approval` / `revoke_stage_approval`（命名待实现决定）；所有模式强制停住 |
| 锁定剧本版本/哈希 | 可由文件哈希实现但无现成阶段 Script | 节点内容可哈希，未形成 locked artifact | 缺失 | 新增“当前剧本指针 + 内容哈希 + 输入快照 + approval”原子能力 |

### P3 角色、声音、四视图、场景与道具

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| 角色需求清单 | 无专用 Script | 普通 Text/metadata 可保存 | 部分已有 | 从锁定剧本确定性提取；不调用外部文字模型；新增 character asset schema |
| 角色总体设定/Variation/声音/场景创意 | 无专用 Script | Gemini Text Config 可执行 | 部分已有 | 只有缺少或实质改造生产资产时合并为一次 P3 综合创意调用；不逐资产串联 GLM |
| 绑定已有角色资源 | 原生可读取角色数据 | 角色/资源列表和导入已有，普通连接可绑定 | 部分已有 | 增加稳定 characterId、Voice ID、reference resource IDs 的绑定校验 |
| 声音设定与参考音频 | [情景化语音任务规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/情景化语音任务规范.md)偏逐句语气；Speech runtime 可生成正式音频 | Voice ID、音频资源输入和 Speech Config 已有 | 部分已有 | P3 只锁定声音身份；新增 voice-profile 产物，不在此阶段生成逐句配音 |
| 四视图生成 | [生成NPC四视图.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/策划/生成NPC四视图.mjs)生成 2048×1024 四视图 | Image Config 可生成支持尺寸的图片 | 已实施 | Script 已升级为四视图；Canvas 侧不需新增图片 provider |
| 四视图生成 | 无 | Prompt + References → Image Config → Image 能完成 | 部分已有 | 新 Prompt、四视图尺寸/布局契约、artifactType、重试与当前版本指针 |
| 四视图验收 | [记录图像验收.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/策划/记录图像验收.mjs)有通用分数/重试框架；现有 Rubric 是三视图 | MCP 没有通用图片视觉验收工具 | 部分已有 | 复用记录框架；新增四视图 Rubric；建议增加通用 `canvas_record_image_review`，不要滥用视频视觉验收工具 |
| 剧本级场景/道具提取 | 无专用 Script | 普通 Text/metadata 可保存 | 部分已有 | Codex 按 scene/prop schema 从锁定剧本提取，不默认调用外部文字模型 |
| 单视角场景设计图 | [生成场景设计图.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/策划/生成场景设计图.mjs)可复用通用图片生成 | Image Config 可完成 | 已有底座 | 生成器保留，改输入目录/语义即可 |
| 单场景整合设计图 | 当前 Script 按 view-dir 逐视图生成，不提供“一场景一整合图”契约 | Image Config 能生成，但无专用 schema | 部分已有 | 新 Prompt；原生 Script 增加 scene-sheet 模式或新脚本；Canvas 增加 sceneId、propIds 与引用校验 |
| 场景图验收 | [记录场景设计验收.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/策划/记录场景设计验收.mjs)有固定检查项 | MCP 无通用图片审核记录工具 | 部分已有 | 扩展为整合图 Rubric，并与“当前已验收场景图”稳定指针绑定 |

### P4 导演总纲与正式分镜文字设计

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| 全片导演总纲 + 正式分镜设计 | 无专用 Script | Gemini Text Config 可执行 | 部分已有 | 作为一次 P4 阶段任务生成；内容过长时只做必要批次，不按字段拆调用 |
| 从锁定剧本拆正式分镜 | 无专用 Script；旧 Skill 由代理写 `分镜计划.json` | Text Config 可生成，`canvas_upsert_shot_column` 可逐列建图 | 部分已有 | 新 Prompt + machine-readable shot plan；先审核计划，再原子创建全部 shot 列 |
| 批量创建全部正式分镜列 | 原生可建目录，但无独立批量命令 | 单次 `canvas_upsert_shot_column` 只处理一列；`canvas_apply_operations` 最多 100 操作可手工批量 | 部分已有 | 增加“按已审核 shot plan 批量 upsert”原子工具，含覆盖检查、列顺序和碰撞校验 |
| 通用阶段/公共工作列 | 原生目录不受影响 | 现工具强绑定 `shot-column`，P1/P2/P3/P4 公共产物只能借用 `shotId: project` | 部分已有 | 泛化为 work-column/stage-column，或正式确认继续复用 shot-column；产品策略待用户确认 |
| 单分镜 Text 组织 | 无专用 Script | 可将同一 Gemini 阶段 Result 拆入各 shot 列 | 部分已有 | Codex / Script 组织已生成结果；不为每个 shot 默认再调用 Gemini/GLM |
| 跨分镜覆盖与连续性总审 | 原生视频脚本有后期 `tail-frame` 检查，但没有 P4 全片文字审核命令 | GLM Text Config 能分析；系统不验证剧本片段是否完整覆盖 | 缺失业务契约 | GLM 整阶段一次总审 + deterministic 校验 script range、ID、依赖无环；回修后仅复核受影响边界 |
| 分镜变更级联失效 | 部分原生 H3 脚本靠文件哈希/指针检测 | Canvas runtime 只有当前 Config 输入快照，不掌握阶段依赖图 | 部分已有 | 新增 artifact dependency/current-result/invalidation 原子能力 |

### P5 Storyboard Prompt、生成与确认

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| Storyboard Prompt 生成 | 旧流程由 Skill 写 `分镜画面提示词.md` | 普通 Text/metadata 可保存 | 部分已有 | 从 P4 移到 P5；由 Codex/Script 按固定模板组装，不默认调用 Gemini |
| Storyboard 图片生成 | [生成分镜图.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/策划/生成分镜图.mjs)支持场景/角色引用与尺寸校验 | Image Config 支持有序引用并产生 Image | 已有底座 | 更新引用契约为四视图、场景整合图和 Variation；保留真实节点链 |
| Storyboard 图片验收 | [记录图像验收.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/策划/记录图像验收.mjs)可记录评分 | MCP 无通用 Image Review 工具 | 部分已有 | 与 P3 共用通用图片审核原子能力；记录图片 SHA、Prompt/inputSnapshot 和当前指针 |
| P5 是否用户 Gate | 旧契约仅互动模式确认；新流程尚未最终明确 | 无专用 approval 工具 | 待用户确认 + 能力缺失 | 若保留 Gate，复用统一 stage approval，不单独造一套 |

### P6 正式 H3 分镜 Prompt 锁定

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| H3 runtime brief 组装 | [生成H3提示词.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/视频/生成H3提示词.mjs)能汇总旧目录资产 | Text Config 可读取节点引用 | 部分已有 | Script 去除旧阶段/目录假设；输入模式只控制真实媒体与帧约束，不选择 System Prompt |
| H3 通用 System Prompt | Ref2VA 六段式模板已存在 | System Text → Text Config 已支持 | 已有 | 所有输入模式固定使用同一 templateKey/version/SHA；旧四模板只作历史核对 |
| H3 Prompt 生成 | 原生脚本读取通用 Ref2VA System Prompt，并通过 `ARK_MODEL` 使用豆包 Seed 2.1 Turbo | 豆包 Text Config 已由通用 runtime 支持 | 已有 | 保留单模板和豆包，不新增 Mode Router |
| H3 Prompt 技术检查 | `生成H3提示词.mjs` 只拒绝空响应与 20,000 字符以上响应 | runtime 保留请求/结果状态与输入快照 | 已有 | 不检查 Prompt 内容结构，不增加 validator 或审核 Config |
| P6 Prompt 锁定 | 原生有文件清单/哈希概念；无统一用户 Gate | Canvas 无当前 Prompt 指针/锁定命令 | 缺失 | 新增 artifact lock/current candidate/input snapshot；是否需要用户确认待用户确认 |

### P7 已取消

不再需要 Trailer 聚合、压缩 Prompt、Preview 隔离或 P7 approval 原子能力。P6 直接进入 P8。

### P8 正式 H3 分镜视频生成与一致性闭环

| 原子能力 | Script | MCP / runtime | 覆盖 | 建议 |
|---|---|---|---|---|
| 按 P6 锁定 Prompt 生成正式视频 | [生成H3分镜视频.mjs](../../plugins/croco-video-factory/skills/croco-video-factory/scripts/视频/生成H3分镜视频.mjs) | H3 Config → `canvas_run_nodes` → Video | 已有底座 | P8 只校验 P6 lock；不再要求 P7 approval |
| 并发、状态、取消、重跑 | 原生脚本有并发与重用判断 | MCP run job 已支持 | 已有 | 保留 |
| `tail-frame` 依赖调度 | 原生脚本有依赖图、前镜尾帧哈希与失效检查 | 通用 `canvas_run_nodes` 只按传入 Config 做并发，不提供正式分镜 DAG 调度原子契约 | 部分已有 | 增加按 shot dependency DAG 调度的 batch run，或 MCP 编排层逐链等待；前者更可靠 |
| H3 输入快照 | 原生 manifest/pointer 有哈希 | Canvas runtime 记录 prompt/system/media 快照 | 已有底座 | 扩展记录 P6 locked artifact ID/hash、目标/实测时长、`generationSegmentId` 与 tail-frame 来源哈希 |
| 视频综合评估 | 无视频理解脚本；Codex 直接查看真实 Video | 现有 Video 查询与 Comment/metadata 可保存记录 | 已有底座 | 使用 P8 综合评估规范；记录 P2/P4/P6/Video 哈希、各维度时码证据、归因和唯一总评；默认不建外部模型 Config |
| P6 定向拆分/扩展 | 原生版本化 Prompt/目录可表达 | 同一 shot column 内新增 Result/Config 可表达 | 部分已有 | 优先场景切换或不连续边界，非必要不创建 tail-frame；保留 P4 shotId |

## 4. 建议新增/优化能力清单

### P0：阻塞新流程正确性的原子能力

| 能力 | 类型 | 最小职责 |
|---|---|---|
| 统一阶段 Gate / Approval | MCP + command/schema | 写入不可伪造的 approvalSnapshot；验证当前产物/输入哈希；输入变化撤销；阻止下游运行 |
| Current Artifact / Lock | command/schema | 在多个生成候选中选择当前版本，锁定 ID、内容/资源哈希和上游快照；保留历史结果 |
| Artifact Dependency / Invalidation | command/runtime | 记录 P1–P8 依赖边；上游变化只使受影响产物和下游 Gate 过期 |
| P2 Fact Gate | schema + orchestration | Claim/source 结构、Codex source verification 结论、失败回大纲、通过后才允许运行剧本 Config |
| P8 Video Evaluation Record | schema + orchestration | Codex 直接综合评估真实 Video + P2/P4/P6；记录 `pass/regenerate/revise-p6/blocked-upstream/needs-review`、维度证据与输入快照，不新增视频理解脚本 |

### P1：生产资产与 Canvas 组织能力

| 能力 | 类型 | 最小职责 |
|---|---|---|
| 通用 Work Column | MCP/布局优化 | 支持 project/global/stage/trailer/shot 工作单元，不强迫所有公共策划都伪装成 shot |
| 批量 Shot Plan Upsert | MCP 原子工具 | 验证已审核 shot plan，并一次创建/更新/排序所有正式分镜列和真实连接 |
| 通用 Image Review | MCP + command | 对四视图、场景整合图、Storyboard 记录 Rubric、图片 SHA、输入快照、当前选择和重试状态 |
| 角色/Variation/Voice Profile schema | 数据契约 | 稳定资产 ID、继承/变更字段、Voice ID、参考音频资源 ID 与剧本依据 |
| 场景整合图 schema | Script + MCP metadata | sceneId、空间不变量、道具锚点、整合图资源、审核状态和引用关系 |
| Shot Coverage Validator | Script/command | 校验 locked script range 全覆盖、无冲突，引用 ID 有效，依赖无环且连续性字段完整 |

### P2：可在上述基础上补齐的优化

| 能力 | 类型 | 说明 |
|---|---|---|
| Prompt Template Registry | MCP/schema | 按 templateKey/version 查询或植入可见 System Text，避免散落复制；用户编辑后仍由哈希追踪 |
| 原生/Canvas 同构 artifact schema | Skill + Script | 同一阶段产物在 Markdown/JSON 和 Canvas metadata 中字段一致 |
| H3 DAG Batch Run | MCP/runtime 优化 | 独立链并发、tail-frame 链等待，统一状态/取消/失效传播 |

## 5. 不建议增加的能力

1. **不要新增 MCP 直连 Gemini/GLM/H3 的“生成并直接写结果 Text/Video Node”工具。**现有 Config runtime 已是唯一正确生成路径。
2. **不要为每个 Prompt 建一个细碎 MCP tool。**Prompt 是可见 System Text 资产；MCP 原子能力应集中在图构建、运行、Gate、锁定、失效和验证。
3. **不要再建第二套项目持久化或直接编辑 `project.json`。**所有非 UI 写入继续走 `canvas-commands.ts`。
4. **不要把研究过程伪装成 Text Node。**只把研究输入、来源记录和审核结论作为真实节点产物。
5. **不要恢复 P7 Preview。**当前固定链是 P6 → P8 → Codex 综合评估；生成/技术问题重生成当前片段，承载问题才回 P6。

## 6. 总结

现有系统已经具备约三类关键底座：**真实节点生成链、原子画布写入、Text/Image/H3/语音/音乐 provider runtime**。因此 P1–P8 不需要重造模型调用层。

真正缺的是把新流程变成“系统可证明执行正确”的业务原子能力：**Gate/确认、当前产物锁定、依赖失效、Claim 事实链、角色/Variation/场景资产 schema、批量分镜列构建、通用图片验收，以及 P8 综合评估记录与定向重生成/P6 回流**。如果只依赖自由 metadata 和代理自律，流程可以演示，但不能稳定保证 Auto 与手动模式得到一致、可追溯的结果。

## 7. 待用户确认

1. 公共策划区是否正式新增通用 `work-column/stage-column`，还是继续复用现有 `shot-column + shotId: project`。
2. Croco MCP 是否需要内建研究/检索原子能力；或保持由 Codex 外部研究，再把来源结果导入 Canvas。
3. P5 Storyboard 是否为强制用户 Gate；当前只确认 P2 必停。
4. P6 H3 Prompt 锁定是否也需要用户确认。
5. 图片审核在确定性 Rubric 与人工查看仍无法定论时，是否允许临时启用视觉模型 fallback，以及对应失败重试政策。
6. `tail-frame` 调度由 MCP/runtime 增加 DAG batch tool，还是由上层编排逐链等待；建议前者以减少竞态。

## 8. 现有更新 Protocol

当前项目已经存在更新协议，但它由四个相互衔接的权威入口组成，而不是由一个文件重复定义全部规则：

| 层级 | 权威入口 | 负责内容 |
|---|---|---|
| 长期规则晋升与变更审批 | [Continuous Learning](../../plugins/croco-video-factory/skills/continuous-learning/SKILL.md) | 证据门槛、候选分类、定位既有体系、重构审核包、用户确认、重构与验证 |
| Croco Video Factory 经验回写 | [经验沉淀规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/经验沉淀规范.md) | 哪些生产反馈足以影响 Skill、Auto 模式也不得跳过确认、如何回写共享流程与执行适配层 |
| 项目源码与发布约束 | [项目 AGENTS.md](../../AGENTS.md) | 权威源码位置、canonical write path、MCP parity、版本同步、构建和端到端验证 |
| Skill 结构和验证方法 | [Skill Creator](/Users/raymond/.codex/skills/.system/skill-creator/SKILL.md) | 修改既有 Skill 时的结构原则、资源组织、`quick_validate.py` 与 forward-test 方法 |

### 8.1 适用于本次 P1–P8 重构的更新顺序

```text
用户确认流程方案与待决政策
        ↓
把本轮纠正、现有能力审计和缺口表整理成“重构审核包”
        ↓
明确单一权威定义和受影响范围
        ↓
用户明确批准目标文件与建议变更
        ↓
先改共享流程 / 阶段契约 / 产物 schema
        ↓
分别审计 Canvas MCP 与 Skill 原生两套原子能力，只更新实际受影响项
        ↓
将旧规则迁入新权威；只把已完整覆盖、无调用方的重复表达列为删除候选
        ↓
同步版本与 bundle manifest
        ↓
执行 Skill、Script、REST、MCP、Canvas live sync 与兼容性验证
        ↓
报告结果、剩余风险和回滚方法
```

### 8.2 变更规则

1. **先审后改**：当前三份流程/Prompt/能力文档属于审核材料，不代表已经获准改长期规则。
2. **先改共享抽象**：P1–P8 阶段顺序、公共输入输出、Gate、失效规则先在唯一流程权威中定义；不得先在 Canvas 或原生后端单独增加一套新流程。
3. **再分别审计两套原子能力**：Canvas MCP 与 Skill 原生分别判断现有能力能否实现同一阶段语义；只更新实际存在缺口的一侧，不为流程变化机械复制两套流程或强求实现粒度一致。
4. **Prompt 作为受管理资产**：现有模板保留稳定 key/version；替换资产创建新版本并更新引用，不静默覆盖旧结果所使用的版本。
5. **Skill 变更使用 Skill Creator**：修改 `SKILL.md`、references 或 scripts 时保持入口精简、职责分层和单一权威来源；更新后检查 `agents/openai.yaml` 是否仍匹配。
6. **只改 Git 权威源**：长期修改只写入本仓库 `plugins/croco-video-factory/`；不得修改 `~/.codex/skills` 或 Plugin cache 的安装副本。
7. **强制 MCP parity 判断**：节点类型、metadata、状态、布局、资源、生成参数、结果形态或任何可远程操作能力变化时，必须同步评估并更新权威 MCP；若不需要更新，也要在交接中说明原因。
8. **使用 canonical runtime**：Canvas UI 和 MCP 都继续通过 `server/canvas-node-runtime.ts` 运行 Config；不得增加绕过图的 provider 路径。
9. **版本同步**：发布时同步 `package.json`、`.codex-plugin/plugin.json` 和 `compatibility.json`，再由构建生成 `bundle-manifest.json`。
10. **验证与回滚**：Skill 运行 `quick_validate.py`、`plugin-eval analyze`，有基线时运行 `plugin-eval compare`；项目变更还需执行 AGENTS.md 中的 build、REST、MCP、Canvas live sync、版本增量和覆盖竞态验证。验证失败时回滚本次变更或重新提交审核包。

### 8.3 本轮进入实施前还缺什么

在真正修改 Croco Video Factory Skill 之前，需要先由用户确认本审计文档第 7 节的产品政策，并批准一份具体的“重构审核包”。审核包至少应列出：

- 新的唯一 P1–P8 流程权威文件；
- 需要修改、移动、引用和删除的旧内容；
- [现有规范迁移矩阵](existing-spec-migration-matrix.md)，包括共享流程唯一权威、Canvas MCP 与 Skill 原生原子能力的分别映射，以及 Prompt / Script / MCP 的按需变更边界；
- 版本与兼容性影响；
- 验证计划和可执行回滚方法。

在这些内容确认前，协议要求保持当前状态，不应直接优化 Skill 或实现缺失原子能力。
