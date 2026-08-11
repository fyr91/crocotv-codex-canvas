---
name: croco-video-factory
description: Use when planning or producing a single-topic educational or science video through one fixed P1–P10 evidence-to-delivery workflow, implemented either with visible local Croco Canvas MCP nodes or with the Skill's native project files, scripts, and provider calls.
---

# Croco Video Factory

## 兼容性预检

开始 P1 前运行 `node <plugin-root>/scripts/check-compatibility.mjs`。该检查同时核对实际安装的 Plugin、MCP、全部捆绑 Skill 与 CrocoTV 本地项目版本，而不是只读取 Git 工作区中的副本。退出码为 `2` 时停止生产，向用户报告不匹配项，并提供 `node <plugin-root>/scripts/update-suite.mjs --plan` 的只读更新计划；只有用户明确确认后才运行带 `--apply --confirm` 的更新。

## 首轮选择

第一轮只让用户同时选择两个互不影响的维度；选择完成前不得确认 Topic、角色或风格，不得创建项目或启动生成：

1. **生产控制**：`Auto` 或 `互动`。
2. **执行后端**：`本地 Canvas` 或 `Skill 原生`。

Auto / 互动只改变确认与暂停方式；Canvas / 原生只改变阶段实施方式和状态载体。四种组合必须执行同一流程、阶段契约、门禁、失效规则与交付标准。

## 唯一固定流程

完整阅读[固定制作流程与执行后端规范](references/执行后端选择规范.md)。它是阶段顺序、共同输入输出、门禁和失效规则的唯一权威；领域规范与后端适配器不得重新定义流程。

固定顺序：P1 需求与项目 → P2 事实与脚本 → P3 角色与视觉设定 → P4 配音与真实时间线 → P5 分镜与 Storyboard → P6 Pre-roll 确认 → P7 H3 Prompt → P8 H3 视频 → P9 验收与定向重做 → P10 安全合片与交付。

## 阶段规范路由

只在进入相应阶段时读取对应领域规范：

| 阶段 | 必读规范 |
|---|---|
| P1 | [项目初始化规范](references/项目初始化规范.md) |
| P2 | [内容策划规范](references/内容策划规范.md)、[通识教育视频节奏规范](references/通识教育视频节奏规范.md) |
| P3 | [NPC 角色设计规范](references/NPC角色设计规范.md)、[三视图基础提示词](references/三视图基础提示词.md)、[三视图验收规范](references/三视图验收规范.md)、[故事场景设计规范](references/故事场景设计规范.md) |
| P4 | [情景化语音任务规范](references/情景化语音任务规范.md) |
| P5 | [分镜脚本规范](references/分镜脚本规范.md)、[Storyboard 基础提示词](references/Storyboard基础提示词.md)、[Storyboard 验收规范](references/Storyboard验收规范.md) |
| P6 | [Pre-roll 确认规范](references/Pre-roll确认规范.md) |
| P7–P10 | [H3 视频生成规范](references/H3视频生成规范.md) |

P7 按选定 H3 模式原样使用受管理的 [T2VA](references/H3-T2VA-System-Prompt.txt)、[I2VA](references/H3-I2VA-System-Prompt.txt)、[FL2VA](references/H3-FL2VA-System-Prompt.txt)、[L2VA](references/H3-L2VA-System-Prompt.txt) 或 [Ref2VA](references/H3-Ref2VA-System-Prompt.txt) System Prompt。

## 执行适配

- **本地 Canvas**：完整阅读[Canvas MCP 执行规范](references/Canvas-MCP执行规范.md)与[Canvas 节点产物契约](references/Canvas节点产物契约.md)。通过真实节点、连接和 Config 运行时执行 P1–P10；所有模型与媒体调用都必须可见、可追溯、可重跑。
- **Skill 原生**：完整阅读[原生执行规范](references/原生执行规范.md)。通过 `Projects/` 中的权威文件、现有子 Skill、供应商调用与捆绑脚本执行同一 P1–P10 流程。

未获用户明确同意，不得切换、混用或自动降级后端。后端只是实施适配器，不得新增专属阶段、删减共同产物或改写门禁。

## 并发、暂停与经验沉淀

读取项目 `.codex/.env` 的正整数 `GENERATION_MAX_CONCURRENCY`；缺失或无效时停止。同阶段的独立依赖链可在上限内并发，单条依赖链保持串行。

用户暂停 Canvas 后端时调用 `canvas_cancel_run`；原生后端停止提交新任务并终止仍可安全取消的当前任务。先交付当前结果与状态，再读取[经验沉淀规范](references/经验沉淀规范.md)；将已确认改进重构进既有体系，不追加特例。
