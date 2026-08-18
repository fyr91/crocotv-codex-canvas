# CrocoTV Codex Canvas

CrocoTV 的本地无限画布、Canvas MCP 和 Croco Video Factory Skills 组成的单仓库套件。仓库同时是 Codex Plugin Marketplace；同事只需克隆一次，即可运行 CrocoTV 并安装与之匹配的 Plugin。

## 仓库结构

```text
.
├── server/                         # CrocoTV 本地 API 与 Canvas 运行时
├── web/                            # CrocoTV 本地前端
├── studio/                         # 基于 LumenX 原版 UI 的本地视频工坊
├── plugins/croco-video-factory/
│   ├── .codex-plugin/plugin.json  # Plugin 元数据与版本
│   ├── .mcp.json                  # MCP 安装入口
│   ├── mcp/                       # 当前 CrocoTV Canvas MCP
│   ├── skills/                    # 当前 6 个 Skills
│   ├── scripts/                   # 兼容检查与受控更新
│   └── bundle-manifest.json       # 安装副本的版本与完整性清单
├── .agents/plugins/marketplace.json
├── .codex/.env.example            # 唯一的服务端环境模板
└── compatibility.json             # CrocoTV / Plugin / MCP / Skills 映射
```

`data/`、`refs/`、`characters/`、`Projects/`、所有 `node_modules/`、构建缓存和真实 `.env` 都不会进入 Git。

## 安装

需要 Node.js 20+、npm、Git 和 Codex CLI。

### 1. 安装 CrocoTV 本地项目

```bash
git clone https://github.com/fyr91/crocotv-codex-canvas.git
cd crocotv-codex-canvas
cp .codex/.env.example .codex/.env
# 编辑 .codex/.env，填入本机需要的密钥
npm ci
npm ci --prefix web --legacy-peer-deps
npm ci --prefix studio
npm run build
npm run setup
```

`npm run setup` 会将当前仓库和共享环境文件的位置写入 `~/.config/crocotv/config.json`。该配置不保存密钥，安装到 Codex 全局缓存中的 MCP 和 Skills 通过它找到本地 CrocoTV。

#### GPU 调度中心最小配置

Canvas、Studio、MCP 和 Croco Video Factory Skill 共用 `.codex/.env` 中的同一组调度中心配置。使用 ERNIE、MiniMax H3、LTX 2.5、FlashVSR 或 MiniMax Music 3 时，只需填写：

```dotenv
GPU_API_BASE_URL=https://your-gpu-orchestrator.example
GPU_API_TOKEN=your-token
```

`GPU_API_BASE_URL` 指向统一 GPU 调度中心，不是任一模型服务器；客户端只会调用该地址下的 `/api/v2` 任务、素材和产物接口。不要在 URL 末尾填写 `/api/v2`，也不要把 Token 写入前端设置、项目 JSON 或 Git。

配置后可执行不产生生成费用的连接检查：

```bash
npm run check:gpu
```

检查通过会列出调度中心当前公开的模型合同；模型暂时关闭路由时不会被误报为本地配置失败。旧的 `H3_BASE_URL` / `H3_API_KEY` 仅为迁移兼容，新安装统一使用上面的两个 `GPU_API_*` 变量。

### 2. 安装 Codex Plugin

本仓库是名为 `croco` 的非默认 Marketplace，因此必须先显式添加，再安装其中的 Plugin：

```bash
codex plugin marketplace add fyr91/crocotv-codex-canvas --ref main
codex plugin add croco-video-factory@croco
codex plugin list
```

若 `croco` Marketplace 已经添加过，不要重复添加；更新快照后重新安装：

```bash
codex plugin marketplace upgrade croco
codex plugin add croco-video-factory@croco
```

重新打开一个 Codex 任务后，Plugin 内的 MCP 与 6 个 Skills 才会按新安装版本加载。

### 3. 从旧的个人 Plugin 迁移

同一时间只保留一个提供 `crocotv` MCP 的 Plugin，避免工具重名或加载旧代码。先运行 `codex plugin list`；只有列表中确实存在旧的 `crocotv@personal` 时，才执行：

```bash
codex plugin remove crocotv@personal
codex plugin add croco-video-factory@croco
```

该命令只移除旧 Plugin 的安装记录和缓存，不删除旧源码目录。完成后开启新的 Codex 任务。

### 4. 启动与验证

在 CrocoTV 仓库根目录运行：

```bash
npm run dev
```

浏览器打开 `http://localhost:3000`；Header 中的“视频工坊”会打开 `http://localhost:3010`。API Key 只由本地服务读取，不会写入画布项目、浏览器存储、Plugin 清单或 Git。

`npm run dev` 会同时启动 Canvas（3000）、视频工坊（3010）和本地 API（4399）。为兼容旧的启动器，根目录的 `npm run dev:web` 也会启动这套完整服务；只调试 Canvas 前端时使用 `npm run dev:canvas`。

已有旧版根目录 `.env` 时，可一次性安全迁移到共享位置：

```bash
npm run setup -- --migrate-env
```

迁移只补充目标文件中缺少的变量，并将原文件改名为被 Git 忽略的时间戳备份。

## 为什么安装版本仍能正确检查

CrocoTV 项目和 Codex 的 Plugin 缓存是两个不同位置。`npm run setup` 会把本机 CrocoTV 仓库路径和共享环境文件路径写入 `~/.config/crocotv/config.json`；该文件不含密钥。安装后的 MCP 和 Skill 由此找到实际 CrocoTV 项目。

Plugin 中的主 Skill 会在开始 P1 前从自身安装目录运行兼容检查：读取该安装副本的 `bundle-manifest.json`、逐个验证 Skill 哈希，并与运行中的 `/api/status`（未运行时使用本地 `compatibility.json`）比较版本和数据契约。检查还会核对全局启用版本、Marketplace Skill 哈希、`~/.codex/skills` 同名遮蔽、旧 Plugin 和重复 MCP server 名称。因此生产时检查的是“Codex 实际加载的 Plugin + 实际 CrocoTV 项目”，不是只比较 Git 工作区同一文件夹中的几个版本号。

仓库开发者可在提交前检查待发布副本：

```bash
npm run check:compatibility
```

## 版本与更新

版本映射集中在 `compatibility.json`。发布时必须同步更新 CrocoTV、Plugin、MCP、Skills Bundle 版本和兼容范围，再运行：

```bash
npm run build
npm run check:compatibility
```

Plugin 可先生成只读更新计划：

```bash
node plugins/croco-video-factory/scripts/update-suite.mjs --plan
```

只有用户确认、工作区干净且 Git remote 是本仓库时，才允许执行：

```bash
node plugins/croco-video-factory/scripts/update-suite.mjs --apply --confirm --target main
```

“更新 Croco Video Factory、Plugin、MCP 或 Skill”统一表示整套更新，不提供 Plugin-only 路径。更新器只接受授权仓库的 fast-forward，随后重新安装锁定依赖、重建应用/MCP/Skills Bundle、执行 setup、刷新 Marketplace 并重新安装 Plugin。它会把同名独立 Skill 移到 `~/.codex/backups/croco-video-factory/` 的时间戳备份，停用被替代的 `crocotv@personal`，最后从全局安装副本执行兼容与实际加载来源检查。

应用仓库存在未提交修改时，更新器立即停止并列出修改；它不会自动 stash、覆盖、reset，也不会退化成只更新 Plugin/Skills。完成整套更新后需开启新的 Codex 任务。

### 团队开发与发布

不要直接编辑 `~/.codex/skills` 或 Codex Plugin cache；这些都是安装副本。权威源码始终是本仓库的 `plugins/croco-video-factory/`。

开发者修改 CrocoTV、MCP 或 Skill 后：

```bash
npm run build
npm run check:compatibility
git add -A
git commit -m "描述本次变更"
git push origin main
```

需要发布新兼容版本时，同时更新 `package.json`、`plugins/croco-video-factory/.codex-plugin/plugin.json`、`compatibility.json` 和 `VERSION`，提交构建后的 MCP、Skill runtime 与 `bundle-manifest.json`，再创建对应 Git tag。其他设备随后运行 Marketplace upgrade，或由上面的受控更新器同步整套版本。

## 本地数据

每个画布保存在 `data/projects/<project-id>/project.json`。用户导入、生成结果和角色资源由本地 `data/resources/index.json` 管理，不会提交到公共仓库。
