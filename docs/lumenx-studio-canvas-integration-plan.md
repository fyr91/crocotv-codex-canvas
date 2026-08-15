# LumenX Studio × Croco Canvas 集成规划

## 1. 目标

在保留 LumenX Studio 现有信息架构和主要交互形式的前提下，将它的模型调用、媒体存储、项目持久化和任务执行全部替换为 Croco Canvas 的本地能力。

最终产品不是两个互相导入导出的项目系统，而是同一个项目的两个视图：

- **Studio 视图**：Script → Art Direction → Cast → Storyboard → Assembly 的结构化生产界面；
- **Canvas 视图**：同一项目的自由图形表达、例外处理、审核、返工和 Agent 扩展界面；
- **Studio–Canvas Adapter**：把 Studio 领域命令编译成 Canvas 原子操作和生成模组执行，并将结果投影回 Studio 响应；
- **Studio MCP**：给 Agent 提供高层生产语义；现有 Canvas MCP 继续提供底层自由操作。

## 2. 上游基线

- 仓库：`https://github.com/alibaba/lumenx.git`
- 本地只读参考：`refs/lumenx/`
- 锁定提交：`f2a02e23171447c939e7d8e1386b24d17049bbf1`
- 提交日期：2026-08-11
- 许可证：MIT，后续若复制或改编实质代码，必须保留 Alibaba 的版权和许可声明。

`refs/` 继续由 `.gitignore` 排除，不作为发行源。真正采用的代码必须经过审查后进入正式源码目录，并记录来源与许可证。

## 3. 已确认的 LumenX 后端边界

LumenX 的后端是运行在 `127.0.0.1:17177` 的 Python/FastAPI 本地服务，包含：

1. `src/apps/comic_gen/api.py`
   - Studio 兼容 API；
   - 项目、系列、资产、分镜、Take、声音、合片和导出端点。
2. `src/apps/comic_gen/pipeline.py`
   - Studio 领域规则和任务编排；
   - Script、Series/Episode、Character/Scene/Prop、StoryboardFrame、VideoTask、Assembly。
3. `src/models/*` 与 `src/audio/*`
   - DashScope/Wan、Kling、Vidu、MuleRouter、Qwen、CosyVoice/Qwen3-TTS 等 provider adapter。
4. `output/*`
   - `projects.json`、`series.json`、`library_assets.json` 和生成媒体。

目标架构中：

- Studio 前端及领域交互保留；
- Python provider adapter 不进入生产路径；
- LumenX `output/*` 持久化不进入生产路径；
- 有价值的领域规则重写为 TypeScript Studio Commands；
- 原接口中 Studio 前端实际依赖的部分由兼容 API 提供；
- 一切生成通过 `server/canvas-node-runtime.ts`；
- 一切项目写入通过 `server/canvas-commands.ts` 和 `server/storage.ts`；
- 一切媒体进入 `data/resources/`；
- 一切 remotely useful 的 Studio 行为同步提供 MCP。

## 4. 核心架构决策

### 4.1 单项目、单版本、双视图

Canvas Project 是唯一持久化和版本控制单元。项目文档扩展一个结构化 `studio` 字段，同时保留现有 `nodes` 和 `connections`：

```ts
type StudioBackedCanvasProject = CanvasProject & {
  studio?: {
    schemaVersion: 2;
    mappingVersion: 2;
    source: "lumenx-studio";
    originalText: string;
    workflowMode: "r2v" | "i2v_legacy";
    characters: StudioCharacter[];
    scenes: StudioScene[];
    props: StudioProp[];
    artDirection?: StudioArtDirection;
    frames: StudioStoryboardFrame[];
    assembly: StudioAssemblyState;
  };
};
```

不新增 `projects.json`、`series.json` 或第二套项目写入路径。Studio State 与相关 Canvas graph 必须在同一个 per-project queue 中原子更新、共同递增版本，并发布完整 project event。

### 4.2 Studio 兼容 API 是 facade，不是第二个后端

Studio 前端继续使用熟悉的 `/projects`、`/storyboard`、`/frames`、`/assets`、`/merge` 等响应形状。新的 Express Router 负责：

1. 校验 LumenX-compatible 请求；
2. 转换成 Studio Command；
3. Studio Command 生成 Canvas operations；
4. 通过 canonical command/runtime 执行；
5. 将 Canvas Project 投影成 LumenX-compatible 响应。

兼容 API 不得直接调用 provider、直接写 JSON 或自己维护任务状态。

### 4.3 稳定映射，不做随机重建

每个 Studio 实体对应稳定的 Canvas 节点或节点组。节点 metadata 至少包含：

```ts
type StudioMappingMetadata = {
  studioManaged: true;
  studioEntityType: "script" | "art-direction" | "character" | "scene" | "prop" | "frame" | "take" | "assembly";
  studioEntityId: string;
  studioRole: string;
  studioMappingVersion: 2;
};
```

节点 ID 使用项目 ID、实体类型、实体 ID 和 role 生成的稳定短哈希，不依赖每次转换时的随机 UUID。重复执行 mapping 必须幂等：更新既有节点，不产生副本。

### 4.4 托管图与自由图共存

- `studioManaged=true` 的节点由 Adapter 管理；
- 普通 Canvas 节点属于自由扩展区；
- Studio 只反向接收明确支持的动作，例如“采用为 Take”“替换角色参考”“设为最终镜头”；
- 任意自由连线不自动改写 Studio 领域状态；
- Adapter 重投影时不得删除或覆盖自由节点。

Studio 托管节点不是第二份可独立编辑的数据。写入按以下边界处理：

- 位置、宽高等视觉几何可以在 Canvas 调整；
- 内容、实体关系、节点角色、关键连接必须转换为对应 Studio Command；
- Canvas 全文档保存会保留 Studio state、托管节点语义和托管连接，只接收托管节点的视觉几何；
- 通用 Canvas operations 和通用 Canvas MCP 不得创建、删除、改写或重连 Studio 托管语义；
- 需要自由实验时，后续提供显式“解除 Studio 管理/复制为自由节点”，不直接破坏原流程。

### 4.5 UI 和 MCP 使用同一命令层

Studio UI、Studio MCP 和兼容 REST API 都调用相同的 `studio-commands.ts`。不得让 Agent 走另一条“看起来像 Studio、实际丢失连接媒体”的 provider 路径。

## 5. Studio → Canvas 映射

| Studio 领域对象 | Canvas 表达 | 主要资源/运行时 |
|---|---|---|
| Project | 同 ID Canvas Project + `project.studio` | project queue/version/events |
| Script | Text 节点、分析 Config、结构化结果节点 | text generation runtime |
| Art Direction | Group + 风格 Text + 参考 Image | text/image runtime |
| Character | 资源 metadata + Character Group + Image/Audio | resource store/image/speech |
| Scene | Scene Group + 参考 Image | resource store/image |
| Prop | Prop Group + 参考 Image | resource store/image |
| StoryboardFrame | Shot Column Group | shot-column commands |
| Frame Prompt | Text + Config | text/image/video runtime |
| Take | 同一 shot column 中的 Video 节点 | generation job/rerun |
| Selected Take | frame state + Video metadata | Studio Command |
| Dialogue | Text + Audio Config + Audio | speech runtime |
| Assembly | 有序 source Video + merged Video | canvas video tools |

## 6. 模型接入原则

Studio 不再维护独立 provider adapter。Studio 模型选择必须来自 Canvas 模型目录，并保留显式 model ID。

首期只展示 Canvas 当前真正可执行的模型：

- 文本：Volcano/DeepSeek、BigModel GLM、Runware Gemini；
- 图片：Nano Banana、GPT Image；
- 视频：canonical MiniMax H3；
- 语音：现有 pull-character voice + Seed-TTS；
- 音乐：Suno。

Wan、Kling、Vidu、PixVerse、Seedance、CosyVoice、Qwen3-TTS 等能力后续必须先接入 Canvas provider/catalog/runtime，再由 Studio 自动消费。不能为了兼容 Studio 保留 LumenX 的直接 provider 调用。

## 7. Studio MCP 设计

不把 LumenX 的一百多个 REST 端点逐个暴露为 MCP。MCP 使用少量高层、原子、可恢复工具：

1. `studio_create_project`
2. `studio_get_project`
3. `studio_get_pipeline_status`
4. `studio_set_script`
5. `studio_analyze_script`
6. `studio_set_art_direction`
7. `studio_generate_assets`
8. `studio_build_storyboard`
9. `studio_run_shots`
10. `studio_select_take`
11. `studio_generate_dialogue`
12. `studio_assemble`

长任务返回 job ID，并复用现有 Canvas run-job 查询、取消、节点锁和事件机制。所有输入使用 typed/bounded schema，所有副作用工具标明非只读和幂等性。

Agent 的推荐分工：

- Studio MCP：标准生产路径、阶段状态、批量操作；
- Canvas MCP：单镜头例外、自由实验、审核、重新生成和图布局。

## 8. 正式源码布局建议

```text
studio/                              # 经许可审查后引入的 Studio 前端源码
  LICENSE.lumenx
  package.json
  src/

server/
  studio-types.ts                    # Studio canonical types
  studio-schemas.ts                  # 请求和持久化校验
  studio-commands.ts                 # 领域命令
  studio-canvas-mapping.ts           # 稳定投影/反向采用动作
  studio-api.ts                      # LumenX-compatible Express router
  studio-jobs.ts                     # 长任务协调，复用 Canvas runtime

plugins/croco-video-factory/mcp/
  server.ts                          # Studio MCP + 现有 Canvas MCP
```

Studio 前端继续作为独立静态应用构建。开发态可运行在单独端口，生产构建以静态资源挂载到 `/studio/`。Canvas 保持 `/canvas/:id`；Studio 的“在 Canvas 打开”按钮使用同一个 project ID 跳转。

## 9. 分阶段实施

> 2026-08-14 实施状态：Phase 0–6 的本地结构化状态、兼容 REST、Canvas 投影、统一资源、统一生成 Runtime、Series/Episode 和 MCP 高层入口均已落地。付费生成仅在用户或 Agent 显式执行对应阶段时调用；验收使用无付费的结构化写入、映射、版本、SSE、构建和 MCP 契约测试。原版中 Croco 当前没有等价 provider 的能力（例如真正的云端音色克隆）按本地兼容语义降级为 pull-character 基础音色上的预设，不恢复 LumenX Python provider 路径。

### Phase 0：契约与骨架

- 引入 Studio canonical TypeScript 类型和 Zod schema；
- 为 Canvas Project 增加可选 `studio` state；
- 扩展 canonical command layer，使 Studio state 与图操作可以同事务提交；
- 建立稳定 ID/mapping metadata；
- 增加 mapping 单元测试和版本冲突测试；
- 暂不调用付费模型。

**验收：** 老 Canvas 项目逐位兼容；Studio state 写入递增 project version；已打开 Canvas 实时收到更新。

### Phase 1：首个可运行纵切

- 引入 Studio 前端最小运行面：项目列表、创建项目、Script 页面；
- 实现兼容端点：创建、列表、读取、重命名、删除、更新 script；
- Studio 项目创建时建立同 ID Canvas Project；
- Script 自动映射为 Canvas Text/Group 节点；
- Studio 提供“在 Canvas 中打开”；
- Canvas 自由节点不会被 Studio 保存覆盖。

**验收：** 用户在 Studio 创建并编辑项目，切到 Canvas 能看到稳定映射；在另一个已打开窗口中无需刷新同步。

### Phase 2：剧本分析与 Art Direction

- 将 LumenX 的 extraction/storyboard prompt 契约移植为 Canvas Text Config graph；
- 加入严格 JSON 解析、schema 校验和失败可见节点；
- 映射 Character/Scene/Prop；
- 接入 Art Direction 保存、推荐和参考图；
- 添加 `studio_analyze_script`、`studio_set_art_direction` MCP。

**验收：** UI 和 MCP 生成完全相同的节点图和 Studio state；输入/模型/结果可追溯。

### Phase 3：Cast 与统一资源

- Character/Scene/Prop 全部使用 `data/resources/`；
- 角色图片变体、锁定、收藏、选择结果映射到资源 metadata；
- Voice 只来自 pull characters；
- 语音执行复用 Canvas speech runtime；
- 不引入 LumenX `library_assets.json`。

### Phase 4：Storyboard / Take

- StoryboardFrame 映射为 Shot Columns；
- I2V/R2V 配置映射为 connected Config graph；
- 支持批量抽卡、任务状态、取消、原位重跑；
- Take 选择和收藏写回 Studio state；
- 添加 `studio_build_storyboard`、`studio_run_shots`、`studio_select_take` MCP。

### Phase 5：Assembly / Export

- 构建时间线状态和镜头顺序；
- 复用 ASR/视觉验收；
- 复用 `mergeCanvasVideos`；
- 补 BGM、对白、SFX 混音所需的 canonical 能力；
- 添加 `studio_assemble` MCP。

### Phase 6：Series / Episode 与共享资产

- 在不建立第二套资源索引的前提下实现 Series/Episode 领域关系；
- 全局/系列/单集继承通过 resource metadata 和 Studio state 表达；
- 明确 fork、覆盖、删除引用完整性；
- 最后再覆盖 LumenX 高级接口：前情提要、下一集 Hook、角色出现统计、自定义声音等。

## 10. 首个纵切的文件级任务

1. `server/studio-types.ts`
   - 定义最小 Project/Script/Mapping 类型。
2. `server/studio-schemas.ts`
   - 校验持久化和兼容请求。
3. `server/canvas-commands.ts`
   - 增加有界的 Studio state 操作；禁止未校验任意顶层 patch。
4. `server/studio-canvas-mapping.ts`
   - Project/Script → Group/Text 幂等 mapping。
5. `server/studio-commands.ts`
   - create/update/read/delete；单事务更新 state + graph。
6. `server/studio-api.ts`
   - 最小 LumenX-compatible `/projects` facade。
7. `server/index.ts`
   - 挂载 Studio router 和 `/studio/` 静态资源。
8. `studio/`
   - 引入上游前端并只修改 transport、模型目录入口和 Canvas 跳转。
9. `plugins/croco-video-factory/mcp/server.ts`
   - 增加最小 `studio_create_project`、`studio_get_project`、`studio_set_script`。
10. 测试
    - 稳定映射、幂等、版本冲突、自由节点保留、UI/MCP parity、live sync。

## 11. 每阶段强制验证

1. `npm run build`；
2. `GET /api/status`；
3. 直接调用受影响 REST command；
4. MCP client 列出并调用受影响 Studio tool；
5. 已打开 Canvas 无刷新更新；
6. project version 递增；
7. 延迟浏览器保存不能覆盖 Studio/MCP 更新；
8. 不执行非必要付费生成；
9. 复制 LumenX 源码时验证 MIT notice 已包含。

## 12. 主要风险与控制

### 双重真相

**风险：** Studio state 和 Canvas graph 漂移。
**控制：** 单 project、单 version、同事务写入；禁止 Studio 自有项目文件。

### 兼容 API 范围爆炸

**风险：** 一次性重写上百个端点。
**控制：** 按 Studio 页面实际调用做纵切，未覆盖端点返回明确 capability error，不做静默假实现。

### Studio 重投影破坏自由画布

**风险：** Adapter 重建时删除 Agent/用户节点。
**控制：** 只管理 `studioManaged=true` 节点；自由节点永不被自动删除。

### UI 保留导致双前端依赖

**风险：** Next 14/React 18 与 Vite/React 19 构建链并存。
**控制：** Studio 作为独立静态应用，不共享 React runtime；统一由根脚本构建和本地服务托管，后续再评估是否迁移构建工具。

### Provider 分叉

**风险：** 为快速兼容保留 LumenX provider。
**控制：** 兼容 API 禁止 import provider；生成只能进入 Canvas Node Runtime。

## 13. 当前决策结论

- 采用“单项目、双视图”；
- 保留 Studio 交互，不保留 LumenX Python 后端运行时；
- 使用 LumenX-compatible API facade 减少前端变更；
- Studio state 与 Canvas graph 同版本原子持久化；
- Studio MCP 提供高层流程，Canvas MCP 提供底层自由度；
- 首个实施目标是 Project + Script 的无付费模型纵切；
- Art Direction、Cast、Storyboard、Assembly 按纵切逐步加入；
- `refs/lumenx/` 只作为本地参考，不参与构建或发布。

## 14. 当前实施状态

Phase 0 与 Phase 1 的后端首段已落地：

- Studio canonical state、Zod schema 和稳定 Script 映射；
- Studio-compatible Project/Script REST facade；
- `studio_create_project`、`studio_get_project`、`studio_set_script` MCP；
- Studio state 与 Script managed nodes 原子更新并共用 Canvas project version/event stream；
- 通用 Canvas 写入对 Studio state、托管节点语义和托管连接实施保护；
- 托管节点允许保存位置和宽高，不允许普通保存绕过 Studio Command 改内容；
- 已将锁定版本的 LumenX frontend 引入 `studio/`，保留原版组件、布局、动效和视觉资产；
- 品牌显示改为“视频工坊”，独立运行在本地 `3010` 端口，通过 `/api/studio` facade 访问 Croco 数据；
- Canvas Header 已增加“视频工坊”入口；
- 尚未执行任何付费模型调用。
