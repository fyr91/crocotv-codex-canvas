# Croco Canvas Local — Agent 开发指南

## 产品范围

本仓库是完全本地运行的 CrocoTV 画布及其可安装的 Codex Plugin。必须保留 `web/` 中已经实现的视觉语言、组件、资源、节点行为和交互模式，不得另建并行的 UI 体系。历史 `refs/` 目录仅供本地参考，不属于可分发源码。

受支持的产品范围是无限画布及其本地资源和生成能力。不得重新引入账户管理、分享、共享素材、Happy Horse 或已经移除的工作流节点产品界面。

每张画布分别保存在 `data/projects/<project-id>/` 下的独立文件夹中。所有上传、拉取的角色和生成的资源都必须归入 `data/resources/` 下统一的本地资源目录及其索引。

## 变更沟通与实施确认

对于用户提出的每一项新修改请求、反馈或设计意见，不得立即实施：

1. 先进行必要的只读排查，说明对需求的理解，并简要列出修改方向、影响范围、保持不变的内容及需要确认的模糊点。
2. 存在方向选择时，提供最多三个具有实质差异的方案，说明主要取舍并给出推荐；不得为了凑数虚构方案。
3. 等待用户明确确认修改方向和范围后再实施。确认后按已确认方案连续完成，不重复询问已经明确的事项。
4. 实施过程中出现新的或变化的要求时，暂停受影响的部分，更新方案并重新确认后继续。
5. 每项修改完成并验证后，必须创建本地 Git commit 作为可回退节点。提交只包含本次任务涉及的文件，不得混入工作区中的其他修改；范围较大的任务应按可独立回退的阶段拆分提交。除非用户明确要求，否则不得自动 push。

## Git 分支与 Worktree 规范

`main` 只用于集成已经完成并验证的修改，主 worktree 必须保持干净，不得直接在 `main` 上开发 Feature 或 Bug。只要主 worktree 存在未提交修改，就必须暂停向 `main` 执行 rebase、merge 或功能清理，等待正在进行的开发完成或迁移到独立分支。

每个 Feature 和 Bug 都必须使用一个独立分支及一个对应的独立 worktree：

- Feature 分支命名为 `FEAT-<short-kebab-case-name>`，例如 `FEAT-lumenx-basic-workflow-only`；
- Bug 分支命名为 `BUG-<short-kebab-case-name>`，例如 `BUG-studio-project-create-state`；
- `<short-kebab-case-name>` 使用简短、明确的英文小写单词并以连字符分隔；
- Feature 和 Bug 分支不得添加 `codex/` 等额外前缀；
- worktree 目录命名为 `<repository-name>-<branch-name>`，并默认放在主仓库相邻目录，例如 `crocotv-codex-canvas-FEAT-lumenx-basic-workflow-only`。

标准生命周期如下：

1. 从目标分支已经提交的最新 commit 创建功能分支和 worktree。未提交或未跟踪文件不会自动进入新 worktree，不得复制这些内容作为长期开发基线；如果新任务依赖它们，应先形成明确的基础 commit，或明确从对应的依赖分支创建。
2. 所有开发、测试和提交都在功能 worktree 中完成。一个 worktree 只承载一个明确范围的 Feature 或 Bug，不得把其他任务的文件混入 commit。
3. 集成前确认功能 worktree 干净，并将功能分支同步到最新 `main`。仅由当前开发者使用的功能分支优先执行 rebase；多人共享的分支不得擅自重写历史，应合入最新 `main`。
4. 同步后重新完成与风险相称的验证以及本文件要求的仓库验证。
5. 只有 `main` worktree 干净时才能集成。已 rebase 到最新 `main` 的功能分支优先使用 `git merge --ff-only <branch>`；若无法 fast-forward，返回功能 worktree 查明原因，不得用强制操作绕过。
6. 合并后在 `main` 上完成必要的 smoke test。确认合并成功后，依次执行 `git worktree remove <path>`、`git branch -d <branch>` 和 `git worktree prune`。
7. 未提交、未验证或未合并的 worktree 和分支不得强制删除。除非用户明确要求，否则不得自动 push。

并行 worktree 的代码目录相互隔离：一个功能合入 `main` 不会立即改写其他功能 worktree，其他功能应在各自集成前同步最新 `main` 并解决冲突。但本地运行资源可能仍然共享；同时运行多个 worktree 时，必须避免 API、Canvas 和 Studio 端口冲突，避免写入同一个 `data/` 目录，也不得在共享软链接的 `node_modules` 上并行执行依赖安装或升级。

## 仓库结构

- `server/index.ts`：本地 Express API 和服务启动入口。
- `server/storage.ts`：项目和资源的原子化持久化及项目版本控制。
- `server/canvas-commands.ts`：节点、连接、项目标题和视口状态的标准原子操作。
- `server/canvas-events.ts`：服务端向浏览器推送项目事件的数据流。
- `server/canvas-node-runtime.ts`：生成模块节点的共享执行路径；浏览器和 MCP 都必须调用此运行时，确保相连输入和生成结果图可复现。
- `plugins/croco-video-factory/mcp/server.ts`：面向 Codex 的权威 STDIO MCP 服务。
- `server/mcp.ts`：仅作为兼容入口，不得在此新增 MCP 行为。
- `server/providers.ts`：Runware、Volcano Engine/Ark、BigModel、H3 和 Suno 的服务商适配器。
- `server/speech.ts`：角色语音生成。
- `server/characters.ts`：拉取角色的同步和统一资源入库。
- `web/src/pages/canvas/project.tsx`：CrocoTV 画布 UI 和本地交互编排。
- `web/src/stores/canvas/use-canvas-store.ts`：浏览器项目状态和防抖持久化。
- `web/src/services/canvas-live-sync.ts`：将 MCP 或服务端变更应用到已打开的画布。
- `web/src/types/canvas.ts`：浏览器端节点和连接的权威类型定义。
- `data/`：本地运行时数据；不得将生成数据或用户数据当作源代码 fixture。
- `plugins/croco-video-factory/skills/`：可分发 Skill 的权威源码。
- `.codex/.env`：CrocoTV、MCP 和 Skill 脚本共享的本地密钥；严禁提交。
- `compatibility.json`：套件版本映射和共享契约版本。

## 标准写入路径

不得直接编辑 `data/projects/*/project.json`，也不得增加第二条持久化路径。

所有非 UI 的画布修改都必须使用 `server/canvas-commands.ts`，并且必须：

1. 通过每个项目各自的队列原子执行；
2. 验证节点类型及引用；
3. 递增项目版本；
4. 通过 `server/storage.ts` 保存；
5. 通过 `server/canvas-events.ts` 发布完整的项目更新。

浏览器必须订阅服务端更新，不得让延迟执行的整份文档保存覆盖更新的 MCP 变更。

生成模块的执行也必须走标准路径：浏览器点击和 MCP 调用都必须使用 `server/canvas-node-runtime.ts`。不得新增一条外观看似相连节点流程、实际却丢弃所连接媒体载荷的服务商调用路径。

## MCP 能力对等规则

每次修改本地画布能力时，都必须明确判断是否需要同步修改 MCP 接口。即使结论为“不需要”，也必须完成这项检查。

如果变更新增或修改以下任何内容，必须同步更新 `plugins/croco-video-factory/mcp/server.ts`、相关 schema 和说明，并完成 MCP 验证：

- 项目的创建、删除、命名、加载或持久化；
- 节点类型、节点元数据、默认尺寸、状态值或放置行为；
- 连接规则或端口语义；
- 生成服务商、模型、参数、进度、取消或结果结构；
- 本地资源导入、存储布局、角色资源或语音选择；
- 画布选择、聚焦、视口或其他适合远程操作的行为；
- Codex Agent 无需点击 UI 就应当能够执行的任何命令。

如果 MCP 不需要更新，必须在最终交付说明或变更摘要中记录原因。仅涉及 UI 样式的修改通常不需要更新 MCP，除非它改变了节点的持久化行为或可调用行为。

新的 MCP 写入工具必须使用类型化 schema、有界输入、清晰的副作用标注和标准命令层。当 Agent 通常需要构建一张图时，优先提供一个原子批处理工具，而不是许多细碎调用。

## 本地服务行为

当本地 API 或 Web 应用未运行时，STDIO MCP 服务必须能够启动 CrocoTV。启动过程必须幂等：先检查健康状态，绝不创建重复服务，不得向 stdout 输出 MCP 协议以外的内容，并将后台服务日志写入 `data/runtime/`。

API 和 Web 服务必须绑定到本地接口。文件导入工具必须将可读取路径限制在明确允许的本地目录中，并将导入文件复制到统一资源库。

## 服务商规则

- LLM channel 表示服务商通道，不是模型名称；必须保留明确的模型选择。
- Runware 包含 Gemini 模型和 Nano Banana 图像模型。
- Volcano Engine/Ark 包含已配置的 Doubao 和 DeepSeek 模型。
- BigModel 包含 GLM 模型并且必须保留模型推理能力；不得静默关闭 thinking。
- 语音角色来自拉取的角色资源。
- 视频生成使用已配置的 H3 集成。
- 音乐生成使用 Suno 及其运行时创建的回调服务；不得要求在 `.env` 中提供回调 URL。

严禁在日志、MCP 结果、项目 JSON 或浏览器状态中暴露 API Key、回调密钥或角色访问令牌。

## 分发源码的唯一权威来源

Plugin Skill 和 MCP 只能在 `plugins/croco-video-factory/` 下修改。Codex 全局目录或缓存中的安装版本属于生成后的消费副本，绝不能作为可编辑源码。修改任何捆绑的 Skill 或 MCP 后，必须运行完整构建，重新生成运行时 bundle 和 `bundle-manifest.json`。发布时必须保持 `package.json`、`.codex-plugin/plugin.json` 和 `compatibility.json` 的版本一致。

## 验证

完成相关变更后：

1. 运行 `npm run build`；
2. 验证 `GET /api/status`；
3. 直接调用受影响的 REST 命令；
4. 使用 MCP 客户端启动 MCP 服务，并列出或调用受影响的工具；
5. 验证已经打开的画布无需刷新即可更新；
6. 验证项目版本已经递增，并且浏览器延迟保存不会覆盖 MCP 结果。

涉及生成能力的变更必须测试真实的 Canvas/MCP 路径，不能只测试服务商的 curl 请求。除非验证用户要求的功能确有必要，否则避免发起会产生费用的生成调用。
