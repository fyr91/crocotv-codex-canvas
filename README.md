# CrocoTV Codex Canvas

CrocoTV 的本地无限画布、Canvas MCP 和 Croco Video Factory Skills 组成的单仓库套件。仓库同时是 Codex Plugin Marketplace；同事只需克隆一次，即可运行 CrocoTV 并安装与之匹配的 Plugin。

## 仓库结构

```text
.
├── server/                         # CrocoTV 本地 API 与 Canvas 运行时
├── web/                            # CrocoTV 本地前端
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

## 首次安装

需要 Node.js 20+、npm、Git 和 Codex CLI。

```bash
git clone https://github.com/fyr91/crocotv-codex-canvas.git
cd crocotv-codex-canvas
cp .codex/.env.example .codex/.env
# 编辑 .codex/.env，填入本机需要的密钥
npm ci
npm ci --prefix web --legacy-peer-deps
npm run build
npm run setup
codex plugin marketplace add fyr91/crocotv-codex-canvas --ref main
codex plugin add croco-video-factory@croco
```

重新打开一个 Codex 任务后，Plugin 内的 MCP 与 Skills 才会按新安装版本加载。启动本地应用：

```bash
npm run dev
```

浏览器打开 `http://localhost:3000`。API Key 只由本地服务读取，不会写入画布项目、浏览器存储、Plugin 清单或 Git。

已有旧版根目录 `.env` 时，可一次性安全迁移到共享位置：

```bash
npm run setup -- --migrate-env
```

迁移只补充目标文件中缺少的变量，并将原文件改名为被 Git 忽略的时间戳备份。

## 为什么安装版本仍能正确检查

CrocoTV 项目和 Codex 的 Plugin 缓存是两个不同位置。`npm run setup` 会把本机 CrocoTV 仓库路径和共享环境文件路径写入 `~/.config/crocotv/config.json`；该文件不含密钥。安装后的 MCP 和 Skill 由此找到实际 CrocoTV 项目。

`npm run check:compatibility` 会读取实际安装 Plugin 的 `bundle-manifest.json`、逐个验证 Skill 哈希，并与运行中的 `/api/status`（未运行时使用本地 `compatibility.json`）比较版本和数据契约。因此检查的是“正在安装/运行的副本”，不是简单比较仓库同一文件夹中的几个版本号。

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

更新器只接受 fast-forward、重新安装锁定依赖、重建套件、刷新 Marketplace 并重新安装 Plugin。完成后需开启新的 Codex 任务。

## 本地数据

每个画布保存在 `data/projects/<project-id>/project.json`。用户导入、生成结果和角色资源由本地 `data/resources/index.json` 管理，不会提交到公共仓库。
