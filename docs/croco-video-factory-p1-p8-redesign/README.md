# Croco Video Factory P1–P8 重构任务文档

本目录集中保存本轮前期策划、迁移依据与 Plugin 优化记录。用户已批准按该方案实施；对应 Plugin 权威源已更新为 `0.1.2`。

## 建议阅读顺序

1. [P1–P8 整体流程重构](video-factory-P1-P8-flow-redesign-review-draft.md)
2. [P1–P8 生产与验证模型调用表](model-production-validation-call-matrix.md)
3. [现有规范迁移矩阵](existing-spec-migration-matrix.md)
4. [Prompt 资产复用与缺口清单](prompt-asset-reuse-and-gap-inventory.md)
5. [Script / MCP / Canvas 原子能力审计](video-factory-P1-P8-atomic-capability-audit.md)
6. [早期 P4 导演策划细化稿](P4-director-planning-review-draft.md)

## 使用边界

- 以整体流程重构稿中的最新 P1–P8、模型调用矩阵和 Gate 规则为实施基线；正式运行时以 [Plugin Skill 入口](../../plugins/croco-video-factory/skills/croco-video-factory/SKILL.md)及其 references 为权威。
- 现有规范迁移矩阵负责说明旧核心规则如何保留、迁移和重路由；它不创建第二套流程。
- P4 细化稿形成较早，保留作需求来源；与整体流程冲突时以后者为准。
- 本轮已按原子能力审计中的[现有更新 Protocol](video-factory-P1-P8-atomic-capability-audit.md#8-现有更新-protocol)完成审核、用户确认、实施和验证。
- 本目录不包含代码、运行数据、生成结果或已发布 Plugin 资产。
