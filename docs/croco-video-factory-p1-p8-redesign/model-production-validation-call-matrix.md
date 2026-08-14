# P1–P8 生产与验证模型调用表

> 状态：当前 Plugin Skill 的模型职责摘要。权威阶段定义仍以 [固定制作流程与执行后端规范](../../plugins/croco-video-factory/skills/croco-video-factory/references/执行后端选择规范.md) 为准。

## 口径

- **GPT**：当前执行 Skill 的 Codex 模型；不是额外 Provider API 调用。
- **外部模型**：通过 Canvas Config runtime 或 Skill 原生 Provider 通道显式调用的 Gemini、DeepSeek、GLM、豆包、Nano Banana Lite、GPT Image 02、MiniMax H3 等。
- **Script / 规则**：确定性校验，不写成 GPT 或外部模型审核。
- Canvas 模式中，外部 Provider 生成必须走 `Input/System → Config → Result`。用户对普通图像任务指定 GPT 时可先用 Codex 内置 ImageGen；结果导入资源库后以 `Prompt Text → imported Image` 记录来源，不伪造 Provider Result Node。

## 调用矩阵

| 阶段 | 生产调用 | 验证 / 审核调用 | 非模型 Gate |
|---|---|---|---|
| P1 项目需求与创作边界 | **GPT**：对话澄清、资源理解和项目简报组织 | **GPT**：识别未决边界；无外部验证模型 | Script 完整性检查；缺必要输入时用户补充 |
| P2 主题、大纲、事实 Gate 与剧本锁定 | **GPT**：研究编排、Claim/source 映射与回流；**Gemini**：主题+大纲一次、剧本初稿一次 | **DeepSeek V4 Pro** `deepseek-v4-pro-260425`：事实 Gate 一次；**GLM**：表达校定/去 AI 化一次，不重复审事实 | Script 校验哈希和 Gate 状态；最终剧本必须用户确认 |
| P3 可生产角色与剧本场景资产 | **GPT**：需求提取、复用判断、资产绑定和 Prompt 组装；缺新资产时 **Gemini** 做一次综合设计；生图默认 **Nano Banana Lite** `google:nano-banana@2-lite`，用户指定 GPT 时按 GPT 路由执行 | **GPT**：根据 Rubric 组织验收；默认无外部文字/视觉审核模型 | 图片 Rubric + 人工视觉确认 |
| P4 导演总纲与正式文字分镜 | **GPT**：组织剧本/资产输入、`shotId`、预估生成时长和回流；**Gemini**：全片导演总纲+逐分镜设计一次阶段任务 | **GLM**：全部草案完成后只做一次跨分镜完整性/连续性/时长可行性总审；**GPT** 组织问题回流 | 不先生成音频；Script 检查 ID、资产引用、覆盖、3–15 秒向上取整和依赖结构 |
| P5 Storyboard | **GPT**：按固定模板组装 Prompt；标准模式外调 **GPT Image 02** `openai:gpt-image@2`；用户选择快速模式时改用 **Nano Banana Lite** | **GPT**：组织 Rubric 验收；默认无外部通用审核模型 | 确定性 Rubric + 人工视觉确认 |
| P6 正式 H3 Prompt | **GPT**：汇总 runtime brief、Ref2VA 通用 System 与有序引用；**豆包 Seed 2.1 Turbo** `doubao-seed-2-1-turbo-260628`：每分镜生成最终 H3 Prompt | 无内容审核/修订模型或 Prompt validator | Script 只检查空响应、20,000 字符硬上限、来源与输入快照；Result 直接锁定 |
| P8 正式 H3 分镜视频与综合评估闭环 | **GPT/Codex**：依赖调度、直接理解真实视频、执行统一综合评估并按归因处理；**MiniMax H3**：按 P6 锁定 Prompt 生成正式视频 | **GPT/Codex**：同一次评估覆盖内容、导演实现、连续性、视听和技术质量；默认无外部验证模型，用户明确指定时例外 | Script 只探测实际时长并校验快照，不理解视频；`regenerate` 重生成当前片段，`revise-p6` 才延长、按场景切换/不连续边界拆分或增加延续片段 |

## P8 之后保留能力

| 能力 | 生产调用 | 验证调用 |
|---|---|---|
| 正式 Speech | **GPT** 编排；**DeepSeek V4 Flash GA** `deepseek-v4-flash-ga-260731` + `thinking.enabled` 做逐字保真语气分段；**Seed-TTS 2.0 Expressive** 生成音频 | 字符级确定性核验和音频文件验证；无额外 LLM |
| 正式音乐 | **GPT** 编排；**Suno** 生成 | 尚未纳入当前自动验收链 |
| ASR / 视觉验收 / 定向重做 / 安全合片 | 按后续共享流程启用，不属于当前 P1–P8 自动链 | 不在本表擅自指定新的审核模型 |
