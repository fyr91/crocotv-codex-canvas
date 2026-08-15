# CrocoTV 视频工坊统一化优化方案

> 状态：已实施并验收（2026-08-15）
> 优先级：P0 基础架构
> 目标读者：主 Agent、Canvas/Studio/MCP 实施者
> 适用仓库：`crocotv-codex-canvas`

## 1. 方案目标

Canvas、视频工坊（LumenX Studio UI）和 MCP/Agent 不应继续发展成三套相互同步的产品，而应成为同一个 CrocoTV 本地视频生产系统的三种操作模式：

```text
Canvas：自由编排模式
视频工坊：结构化工作流模式
MCP / Agent：自动化执行模式
```

三种模式必须共享：

- 同一个项目状态和版本体系；
- 同一个本地资源库；
- 同一个 Prompt Registry；
- 同一个模型目录和 Provider 配置；
- 同一个 Canvas Node Runtime；
- 同一套原子命令、事件同步和生成结果；
- 同一套 MCP 可调用能力。

视频工坊只负责把用户的结构化操作转换成统一命令，不再维护独立的 Prompt、Provider 调用、资源引用或项目持久化路径。

## 2. 目标架构

```text
                    ┌──────── Canvas UI
用户操作 ────────────┼──────── 视频工坊 UI
                    └──────── MCP / Agent
                               │
                        结构化领域操作
                               │
                   Studio State / Canvas Commands
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
   Prompt Registry       Model Catalog       Resource Store
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                      Canvas Node Runtime
                               │
                 生成结果、版本与事件实时同步
```

### 2.1 职责边界

| 层 | 负责 | 不负责 |
|---|---|---|
| 视频工坊 UI | 五阶段流程、用户选择、镜头编辑、反馈输入 | 私有 Prompt、直接调用 Provider、第二套持久化 |
| Canvas UI | 自由节点编排、资源连接、运行状态呈现 | 复制 Studio 项目状态 |
| Prompt Registry | Prompt 正文、版本、模型策略、输入输出契约 | 保存本次动态业务输入 |
| Canvas Runtime | 解析真实连接、调用模型、创建结果节点 | 猜测 Studio 槽位或丢弃多模态输入 |
| Studio State | 系列、集数、艺术方向、演员、镜头和组装状态 | 绕过 Canvas Commands 直接写项目文件 |
| MCP / Agent | 调用同一领域操作和 Runtime | 建立平行的自动化执行路径 |

## 3. 当前问题概览

### 3.1 视频工坊当前内置 Prompt

| 字段 | 当前用途 | 当前是否真正调用 | 问题 |
|---|---|---:|---|
| `entity_extraction` | 提取角色、场景、道具 | 是 | 使用 Studio 自己的简短 Prompt |
| `style_analysis` | 推荐视觉风格 | 是 | 使用 Studio 自己的简短 Prompt |
| `storyboard_extraction` | 拆分连续镜头 | 是 | 使用 Studio 自己的简短 Prompt |
| `storyboard_polish` | 润色分镜画面描述 | 否 | 仅保存和展示 |
| `video_polish` | 润色 I2V/FL2V 视频 Prompt | 否 | 仅保存和展示 |
| `r2v_polish` | 润色 R2V 视频 Prompt | 否 | 仅保存和展示 |
| 服务端隐藏双语 Prompt | 输出 `prompt_cn/prompt_en` | 是 | 硬编码并绕过上述三项润色配置 |

当前润色调用还会丢弃或错误处理：

- `feedback` 未被服务端使用；
- `prev_cn` 未被使用；
- `image_urls` 未被使用；
- `polish_model` 未被使用；
- R2V 只在草稿后追加 slots JSON；
- 润色复用了“分镜结构分析”Config 节点，节点职责混乱。

### 3.2 Canvas/Croco Video Factory 当前正式 Prompt

正式 Prompt 源文件位于：

`plugins/croco-video-factory/skills/croco-video-factory/references/`

| 阶段 | `templateKey` | 版本 | 主要职责 | 模型策略 |
|---|---|---:|---|---|
| P2 主题与大纲 | `croco.p2.theme-outline` | 1.0.0 | 主题分析、Claim、节拍和内容大纲 | Gemini |
| P2 剧本初稿 | `croco.p2.script-draft` | 1.0.1 | 根据已核验大纲生成剧本初稿 | Gemini |
| P2 剧本校定 | `croco.p2.script-calibration` | 1.0.0 | 自然化、表达校定和去 AI 化 | GLM |
| P3 综合生产设计 | `croco.p3.production-design` | 1.1.0 | 角色、Variation、声音、场景和道具 | Gemini |
| P3 艺术方向选项 | `croco.p3.art-direction-options` | 1.0.0 | 生成供用户选择的视觉方向 | Gemini |
| P4 导演策划 | `croco.p4.director-planning` | 1.2.0 | 全片导演总纲和正式文字分镜 | Gemini |
| P4 跨分镜审核 | `croco.p4.cross-shot-audit` | 1.0.0 | 全片连续性、资产和可生产性审核 | GLM |
| P4 单镜头返修 | `croco.p4.shot-revision` | 1.0.0 | 根据反馈和上一版返修单镜头 | GLM |
| H3 视频 Prompt | `croco.h3.universal-ref2va` | 2.0.0 | 生成最终六段式 H3 Prompt | 豆包 Seed 2.1 Turbo |

下列 H3 文件只用于历史项目核对，不得进入新的正式执行：

- `H3-T2VA-System-Prompt.txt`
- `H3-I2VA-System-Prompt.txt`
- `H3-FL2VA-System-Prompt.txt`
- `H3-L2VA-System-Prompt.txt`

新的 T2V、I2V、FL2V、R2V 全部统一使用 `croco.h3.universal-ref2va`。模式差异来自真实媒体连接、顺序和帧约束，而不是切换 System Prompt。

## 4. P0：建立统一 Prompt Registry

### 4.1 权威来源

内置 Prompt 继续以插件目录中的正式文件为源码，不得把 Prompt 正文复制到 Studio 常量或浏览器 `localStorage`。用户在高级设置中创建的全局版本写入本地 Registry 扩展存储；它只追加用户版本，不改写插件内置文件。

建议新增 Registry manifest，仅记录元数据和相对源文件：

```ts
type PromptTemplate = {
  templateKey: string;
  templateVersion: string;
  title: string;
  stage: string;
  sourceFile: string;
  contentSha256: string;
  modelPolicy: {
    defaultModel: string;
    modelFamily: string;
    allowOverride: boolean;
  };
  inputModes: string[];
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  active: boolean;
  legacy?: boolean;
};
```

System Prompt 必须按源文件完整字节读取，不得：

- `trim`；
- 拼接隐藏 system 指令；
- 摘要或翻译；
- 把 runtime brief、反馈或素材描述混进 system message；
- 在 Studio 中保存一份独立正文。

### 4.2 版本层级

```text
内置 Prompt 文件
→ 全局激活版本
→ 可选项目锁定版本
→ 每次执行不可变快照
```

高级设置中修改 Prompt 时创建新版本，不覆盖或删除旧版本；激活操作只移动当前版本指针，因此可以随时重新激活任一历史版本。项目级修改同样追加项目版本，并允许选择跟随全局、锁定全局版本或激活项目版本。每次生成结果必须记录：

```ts
{
  templateKey,
  templateVersion,
  systemPromptSha256,
  systemPromptNodeIds,
  model,
  sourceNodeIds,
  imageResourceIds,
  videoResourceIds,
  audioResourceIds
}
```

### 4.3 需要新增的全局能力

现有正式 Prompt 不能精确覆盖两个 Studio 交互，应在全局 Registry 中新增，而不是继续留在 Studio：

| 建议 `templateKey` | 用途 |
|---|---|
| `croco.p3.art-direction-options` | 根据锁定内容生成供用户选择的视觉方向 |
| `croco.p4.shot-revision` | 根据反馈、上一版和相邻镜头状态返修单镜头 |

### 4.4 Studio 旧字段迁移

| Studio 旧字段 | 统一能力 |
|---|---|
| `entity_extraction` | `croco.p3.production-design` 的结构化输出 |
| `style_analysis` | `croco.p3.art-direction-options` |
| `storyboard_extraction` | `croco.p4.director-planning` |
| `storyboard_polish` | `croco.p4.shot-revision` |
| `video_polish` | `croco.h3.universal-ref2va` |
| `r2v_polish` | `croco.h3.universal-ref2va` |

历史项目中非空的 Studio 自定义 Prompt 不得直接删除，应迁移成项目级兼容版本并标记：

```ts
{ source: "legacy-studio-migration" }
```

如果正式 Prompt 的输出目前无法满足 Studio DTO，应该升级正式模板并增加版本，而不是添加 Studio 私有 system wrapper。Studio 只做确定性的 DTO/状态映射。

## 5. 统一上下文感知执行

### 5.1 标准请求

```ts
type StudioGenerationRequest = {
  projectId: string;
  frameId?: string;
  operation: string;
  templateKey: string;
  draftPrompt: string;
  feedback?: string;
  prevCn?: string;
  targetDurationSeconds?: number;
  orderedResourceIds?: string[];
  resourceRoles?: Array<{
    resourceId: string;
    role: string;
  }>;
  requestedModel?: string;
};
```

动态内容全部作为 user input 或真实媒体输入：

- 原始草稿；
- 本次反馈；
- 上一版中文；
- 项目和系列上下文；
- 相邻镜头状态；
- 目标时长、画幅和模式；
- 有序的图片、视频和音频资源；
- 每个素材的明确用途。

### 5.2 专用 Config 节点

不得继续复用“分镜结构分析”节点进行润色。每个镜头按职责映射：

```text
Studio 镜头
├─ 分镜分析 Config
├─ 视觉上下文 Config（需要视觉理解时）
└─ Prompt 生成/返修 Config
   └─ 正式 Prompt Result
```

用户仍然只在 Studio 点击操作；后端负责创建、更新、连接和执行对应 Canvas 节点。

### 5.3 `feedback` 与 `prev_cn`

- `feedback` 作为独立的“本次修改要求”，不能与草稿无标识拼接；
- `prev_cn` 作为上一版语义锚点，保留未被反馈要求修改的事实和连续性；
- 两者必须进入执行输入快照。

### 5.4 图片与视觉上下文

通用文本默认模型 DS V4 Flash 在当前 Adapter 中不是视觉模型，不能假装直接消费图片。

有参考图时采用两阶段流程：

```text
真实图片资源
→ 视觉模型提取客观上下文
→ 视觉上下文 Result
→ 最终文字/Prompt Config
```

图片应先进入统一本地资源库，再传 `resourceId` 并建立真实 Canvas 连接；不能依赖任意外部 URL。

### 5.5 R2V slots

R2V slots 不得继续序列化为 JSON 追加到草稿末尾，应转换为：

- 有序 Canvas 资源连接；
- 稳定引用标签；
- 素材类型；
- 素材用途；
- 对应的图片、视频或音频 Resource ID。

H3 Runtime 获取真实资源；模型获取结构化的素材语义。两者必须一致。

## 6. 统一模型目录和 Provider

### 6.1 模型命名和默认值

| 类型 | 统一配置 |
|---|---|
| 通用文本默认 | DS V4 Flash：`deepseek-v4-flash-ga-260731` |
| 图片模型 | Nano Banana 2 Lite |
| 图片模型 | Nano Banana |
| 图片模型 | GPT Image 02 |
| H3 输入模式 | T2V、I2V、FL2V、R2V |

需要修正：

- UI 中“Google Image 4”改为“Nano Banana”；
- FL2V 必须有有序 `firstFrame` 和 `lastFrame`，不能只改名称；
- R2V 使用真实图片、视频、音频参考；
- Studio 模型选项来自服务端 Catalog，不再重复硬编码。

### 6.2 模型选择优先级

```text
Prompt 模板规定的任务模型
→ 模板允许覆盖时使用项目/用户选择
→ DS V4 Flash 通用回退
```

因此 H3 Prompt 继续按正式规范使用豆包 Seed 2.1 Turbo，不能被全局 DS V4 Flash 默认值覆盖。

### 6.3 Provider

设置页根据本地环境展示实际 Provider：

- 火山方舟 Ark；
- BigModel；
- Runware；
- H3；
- Suno；
- Croco 角色服务；
- 豆包 TTS。

## 7. Studio 与 Canvas 双向状态映射

Studio 是同一个 Canvas 项目的结构化投影视图，不是第二份项目。

```text
Studio 操作
→ Studio State 结构化命令
→ Canvas 原子命令
→ 节点、连接、版本和事件更新

Canvas 修改 Studio 管理内容
→ 转换成 Studio State 操作
→ 结构校验
→ 重新映射 Canvas
```

节点分类：

- Studio 管理节点：必须通过 Studio State 修改；
- Canvas 自由节点：允许用户自由操作；
- System Prompt 节点：保存本次执行快照；
- Prompt 管理器：创建并激活 Registry 新版本。

所有非 UI 写入继续使用 `server/canvas-commands.ts`，禁止直接编辑 `data/projects/*/project.json` 或增加第二条持久化路径。

## 8. 设置与密钥管理

### 8.1 信息架构

保留：

- 模型；
- API 与供应商；
- 高级设置；
- 关于。

取消：

- 通用设置；
- 存储设置；
- Studio 独立 Prompt 默认值。

语言切换放在主题按钮旁，以中文/英文图标按钮直接切换。主题切换必须与 Canvas 使用同一状态和交互方式。

高级设置改为全局 Prompt Registry 入口，当前支持：

- 查看用途、激活版本和所属阶段；
- 点击模板查看完整正文、模型策略、输入契约和内容 SHA；
- 基于任一历史版本创建新的不可变版本，并可选择立即激活；
- 在不删除历史记录的前提下重新激活任一旧版本；
- 通过项目执行记录查询实际使用的模板版本、SHA、模型和结果节点。

内置 Prompt 的更新继续走插件权威源码与发布流程。运行中的 Studio 不改写可分发插件文件；用户新增的全局版本保存在本地 append-only Registry 中，项目版本保存在对应项目状态中。两者均不提供删除或原地覆盖接口。

关于页仅保留：视频工坊、Version、Build 和检查更新占位按钮。暂不执行真实更新检查。

### 8.2 API Key

普通接口只返回：

- 是否配置；
- 部分脱敏值；
- 配置来源；
- 最后更新时间。

支持：

- 快捷复制完整值；
- 更新密钥；
- 明确清除。

完整密钥只在用户主动复制时短暂获取并立即写入剪贴板，不得进入：

- DOM；
- React State；
- `localStorage`；
- 项目 JSON；
- Canvas 节点；
- 日志；
- MCP 结果。

空更新表示保留原值；清除必须使用独立、明确的操作。

## 9. Studio 视觉与文案统一

视频工坊必须复用 Canvas 的字体、字号、字重、行高、颜色 Token、按钮、输入框、边框、圆角以及交互状态，不建立另一套近似主题。

需要完成：

- 左上返回 CrocoTV，入口位于标题上方；
- 去掉多余 Logo 和不协调的“Video Studio”；
- Light/Dark 使用与 Canvas 相同的常驻切换；
- 全量验证按钮的 Enabled、Disabled、Hover、Focus 状态；
- 推荐标签使用绿色背景并保证文字对比度；
- “Unified Workflow”改为“基础流程”；
- Legacy 等技术术语改为用户可理解的流程名称；
- 清理“保留兼容”“集成某供应商”等开发者口吻；
- 检查所有页面在 Light/Dark 下的按钮和文字可读性。

视觉改动不改变功能、持久化数据或节点行为。

## 10. 建议实施顺序

```text
P0  Prompt Registry、版本和加载 API
P1  Studio Prompt 迁移及历史数据兼容
P2  上下文感知执行、专用 Config 和 H3 资源映射
P3  模型目录、Provider 和 API Key 管理
P4  Studio/Canvas 双向状态映射
P5  设置页面、视觉和用户文案
P6  MCP 对齐、端到端验证和清理旧路径
```

不要先大规模改 UI 再回头调整 Runtime。Prompt Registry、模型策略和标准执行请求是后续工作的基础。

## 11. 主要实施位置

至少检查和修改：

- `server/prompt-registry.ts`（新增）；
- Prompt Registry manifest（新增，位于插件权威源目录）；
- `server/studio-api.ts`；
- `server/studio-workflow.ts`；
- `server/studio-canvas-mapping.ts`；
- `server/canvas-node-runtime.ts`；
- `server/providers.ts`；
- `server/canvas-commands.ts`；
- `studio/src/store/projectStore.ts`；
- `studio/src/lib/api.ts`；
- `studio/src/lib/modelCatalog.ts`；
- `studio/src/components/settings/SettingsPage.tsx`；
- Studio 项目/系列 Prompt 设置组件；
- `plugins/croco-video-factory/mcp/server.ts`；
- 对应 REST、Studio、Canvas Runtime 和 MCP 测试。

插件 Skills 和 MCP 只能修改 `plugins/croco-video-factory/` 下的权威源码，不得编辑 Codex 全局/cache 安装副本。

## 12. MCP 对齐要求

本方案会修改 Prompt、模型、项目状态、资源输入和节点执行行为，因此 MCP 必须同步更新。

MCP 至少需要支持：

- 查询可用 Prompt 模板及版本；
- 查询完整 Prompt 正文、创建全局新版本并切换全局激活版本；
- 查询项目 Prompt 策略、创建项目新版本并切换项目绑定；
- 按 `templateKey` 执行结构化阶段操作；
- 传入反馈、上一版和有序资源引用；
- 查询执行快照和结果；
- 使用 canonical Canvas Commands 修改 Studio 管理内容；
- 不在工具结果中暴露 API Key 或其他秘密。

新增 MCP 写工具必须使用有界 typed schema、清晰副作用说明和原子命令层。

## 13. 验收标准

### 13.1 Prompt 与 Runtime

- [x] `server/studio-api.ts` 不再保留六条简化 `PROMPT_DEFAULTS`；
- [x] 删除服务端隐藏双语润色 system wrapper；
- [x] Studio 不再使用 `lumenx_default_prompt_config` 保存私有 Prompt；
- [x] 所有 Registry 驱动的 AI 操作都能追踪到 `templateKey/templateVersion/SHA`；
- [x] 全局和项目 Prompt 修改只创建新版本，不覆盖或删除历史版本；
- [x] 任一历史版本都可以重新激活，既有执行快照不受切换影响；
- [x] `feedback`、`prev_cn`、模型和真实参考资源均进入执行；
- [x] R2V 不再追加 slots JSON；
- [x] 专用 Prompt Config 不再复用分镜分析节点；
- [x] 历史 H3 模板不进入新执行；
- [x] Canvas、Studio、MCP 调用同一个 Runtime。

### 13.2 状态与同步

- [x] Studio 手动创建或修改内容时 Canvas 自动同步；
- [x] Canvas 修改 Studio 管理内容时通过 Studio State 校验；
- [x] 项目版本正确递增；
- [x] 已打开 Canvas 无需刷新即可接收更新；
- [x] 延迟的浏览器保存不会覆盖更新版本；
- [x] 不存在第二条项目持久化路径。

### 13.3 模型和资源

- [x] 通用文本默认是 DS V4 Flash；
- [x] 任务专用 Prompt 保留规定模型；
- [x] FL2V 使用有序首尾帧；
- [x] R2V 使用真实图片、视频和音频资源；
- [x] 模型名称和 Provider 路由与服务端 Catalog 一致。

### 13.4 安全和界面

- [x] API Key 不进入项目、节点、日志、浏览器持久状态或 MCP；
- [x] 设置页只展示实际可用 Provider；
- [x] Studio Light/Dark 与 Canvas 状态一致；
- [x] 所有按钮在 Enabled/Disabled/Hover/Focus 下可读；
- [x] 用户文案不包含开发实现和兼容术语。

### 13.5 工程验证

- [x] `npm run build` 通过；
- [x] `GET /api/status` 正常；
- [x] 受影响 REST 命令完成直接验证；
- [x] MCP 客户端可以 list/call 受影响工具；
- [x] 已打开 Canvas 可以接收 Studio/MCP 更新；
- [x] 使用 Mock/Fake Provider 完成 Prompt 和资源输入测试；
- [x] 未执行付费生成调用。

### 13.6 实施结果

- 视频工坊继续保持 Script、Art Direction、Cast、Storyboard、Assembly 五阶段交互与业务逻辑；
- Canvas 继续保持自由节点编排，Studio 管理节点通过结构化翻译层修改；
- Studio、Canvas 与 MCP 共享项目 ID、原子版本、事件流、本地资源、模型目录和生成 Runtime；
- MCP 可查询 Prompt/模型/Provider 状态，按 `templateKey` 执行结构化 Prompt，传入反馈、上一版和有序本地资源，并查询不可变执行记录与结果节点；
- 验收使用临时项目与 Mock/契约测试完成，未触发任何付费生成。

## 14. 完成定义

当用户在视频工坊中从脚本、艺术方向、选角、分镜一路运行到 H3 视频生成时，系统应能在 Canvas 中看到同一项目对应的真实节点、Prompt 版本、模型、资源连接和结果；Agent 通过 MCP 执行相同操作时得到完全相同的状态变化和可复现结果。

达到这一状态后，视频工坊不再是“接入 Canvas 的第二套应用”，而是 CrocoTV 统一生产系统的一种结构化操作界面。
