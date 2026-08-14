---
name: croco-video-factory
description: Use when planning or producing a single-topic educational or science video through the fixed P1–P8 brief-to-H3-shot workflow, implemented either with visible local Croco Canvas MCP nodes or with the Skill's native project files, scripts, and provider calls.
---

# Croco Video Factory

## 启动

用户要求更新 Croco Video Factory、Plugin、MCP 或任一捆绑 Skill 时，一律视为整套 CrocoTV 更新：先运行 `node <plugin-root>/scripts/update-suite.mjs --plan`，用户确认后才运行 `--apply --confirm`。更新器必须拉取授权应用仓库、重建应用/MCP/Skills Bundle、重新安装 Plugin、备份移出同名独立 Skill、停用被替代的旧 Plugin，并验证 Codex 实际加载来源；不得提供脱离应用仓库的 Plugin-only 更新。应用仓库存在未提交修改时立即停止并提示用户自行处理，禁止自动 stash、覆盖、reset 或只更新部分组件。

开始 P1 前运行 `node <plugin-root>/scripts/check-compatibility.mjs`；退出码 `2` 时停止生产并提供上述整套更新计划。

第一轮只让用户同时选择：

1. 生产控制：`Auto` / `互动（默认）`；
2. 执行后端：`本地 Canvas（默认）` / `Skill 原生`。

选择前不得确认 Topic、角色或风格，不得创建项目或启动生成。完整阅读 P1–P8 唯一权威：[固定制作流程与执行后端规范](references/执行后端选择规范.md)。

有效后端为 `本地 Canvas` 时，立即运行 `node <skill-root>/scripts/公共/启动本地Canvas.mjs`。该 Skill 脚本直接检查并按需启动 API/Web，不先等待 MCP 调用；两者均就绪后才进入 P1 并使用 Canvas MCP 原子能力。

## Progressive disclosure

先只读取用户选择的后端：

- Canvas：[MCP 原子能力](references/Canvas-MCP执行规范.md)与[节点产物契约](references/Canvas节点产物契约.md)；用户对普通图像任务指定 GPT 时再读取[Canvas ImageGen 落图操作](references/Canvas-ImageGen落图操作规范.md)；
- 原生：[原生原子能力](references/原生执行规范.md)。

进入阶段时再读取：

| 阶段 | 领域规范 |
|---|---|
| P1 | [项目初始化](references/项目初始化规范.md) |
| P2 | [内容策划](references/内容策划规范.md)、[教育节奏](references/通识教育视频节奏规范.md)、[内容审核](../content-optimization-audit/SKILL.md) |
| P3 | [角色设计](references/NPC角色设计规范.md)、[图像模型路由](references/图像模型路由规范.md)、[四视图 Prompt](references/四视图基础提示词.md)与[验收](references/四视图验收规范.md)、[场景设计](references/故事场景设计规范.md)与[综合图 Prompt](references/场景综合设定图基础提示词.md) |
| P4 | [导演总纲与文字分镜](references/分镜脚本规范.md) |
| P5 | [图像模型路由](references/图像模型路由规范.md)、[Storyboard Prompt](references/Storyboard基础提示词.md)与[验收](references/Storyboard验收规范.md) |
| P6、P8 | [H3 Prompt/视频与综合评估](references/H3视频生成规范.md)；所有输入模式统一使用 [Ref2VA 通用 System Prompt](references/H3-Ref2VA-System-Prompt.txt)，形成 Prompt 时才加载 `minimax-video-prompt-optimizer`；P8 由 Codex 按[视频综合评估规范](references/P8-视频综合评估规范.md)直接理解真实视频 |

正式 Speech 启用时才读取[情景化语音](references/情景化语音任务规范.md)与 `character-speaking`；同步角色时才读取技能 `pull-latest-characters`。

H3 输入模式只决定真实媒体引用和请求参数，不选择 System Prompt 或输出结构。P6 由豆包使用同一 Ref2VA 六段式 System Prompt 生成正式 Prompt；Result 不再经过本地或外部内容 validator，也不做事后格式修订。P6 之后直接运行 P8，不再执行 P7 Trailer/Pre-roll。P8 生成后由 Codex 对真实 Video 做统一综合评估，同时覆盖内容、导演实现、连续性、视听与技术质量；除非用户明确指定，否则不外调视频理解模型。失败时按归因选择重生成、从 P6 拆分/扩展生成片段或停止上报，不改 P4 的整体分镜规划。旧 T2VA/I2VA/FL2VA/L2VA 模板仅用于历史项目核对。

## 硬规则

- Canvas / 原生是两套原子能力，不是两套流程；不得复制后端专属 P1–P8。
- Canvas 模型文字必须走“输入/System Text → Text Config → runtime → Result”；反馈通过重跑修订，不直写或修改模型 Result。
- P2 最终剧本在 Auto/互动下都强制暂停确认。
- 只在共享模型矩阵的关键点调用外部 LLM；确定性整理、模板、哈希、状态和 validator 不调用。
- 未经用户同意不得切换、混用或降级后端。

不设置 Skill 级并发上限：所有无依赖任务立即并发，只有真实依赖链（例如 `tail-frame`）按依赖顺序串行。底层 Provider/runtime 的容量、限流或排队是外部执行状态，不得被 Skill 改写为固定并发配置。暂停 Canvas 用 `canvas_cancel_run`。长期改进按[经验沉淀规范](references/经验沉淀规范.md)重构进既有权威，不追加特例。
