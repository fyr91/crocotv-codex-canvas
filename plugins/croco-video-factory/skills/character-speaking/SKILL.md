---
name: character-speaking
description: Use when a user asks a character, Voice ID, 鳄鱼爸爸, or persona to speak, narrate, 配音, 朗读, or generate an MP3 with the local DeepSeek and Doubao TTS Pipeline.
---

# Character Speaking

## Inputs

| Input | Rule |
|---|---|
| Character / Voice ID | Prefer explicit ID. `鳄鱼爸爸` = `S_eH42pcGL1`. Ask for unknown IDs; never invent or search. |
| Content | Require non-empty text. |
| Direction | 上游提供情景化 `direction` 时原样传入；未提供时才省略并由正文推断。 |
| Output | Optional. Omit for a unique file in `output/`; otherwise pass a directory or new `.mp3` path. |

Seed-TTS 2.0 Expressive 默认使用 1.25× 语速，对应请求字段 `speech_rate: 25`。调用方不需要额外传 speed 参数。

语气优化模型使用独立配置 `TTS_TONE_MODEL`，默认正式版 `deepseek-v4-flash-ga-260731`；不得复用 Storyboard 或其他 Ark 工作流的 `ARK_MODEL`。旧值 `deepseek-v4-flash-260425` 自动归一到正式版。请求必须显式传入 `thinking: { type: "enabled" }`，并使用 `json_object` 返回语气分段；应用层必须逐字符校验原文和字段结构，校验失败时最多反馈重试 3 次，只有通过后才可进入 TTS。

批量生成由调用方同时启动所有互不依赖的单条语音命令，不使用供应商 Batch API，不设置 Skill 级并发上限。一个任务从语气优化开始，到 MP3 落盘或失败时结束；同一条语音内部的分段按原顺序依次生成，不得并发。

## 工作流程

1. 将工作目录设为 CrocoTV 仓库根目录。捆绑脚本读取该仓库的 `.codex/.env`，并把默认输出写入当前项目。
2. 明确的生成请求即视为已授权调用 DeepSeek 和豆包，无需再次确认。

```bash
node <character-speaking-skill>/runtime/generate-speech.mjs --voice-id S_eH42pcGL1 --content '每天多走一小步，也是在为健康积累长期收益。' --direction '亲切可信、节奏自然'
```

3. 使用 `test -s` 和 `afinfo` 验证 stdout 返回的绝对路径。
4. 返回 `![角色语音](/absolute/path.mp3)`，并附上角色、Voice ID 和文件路径。

## Failure Handling

- 若捆绑运行文件缺失，停止并提示用户在 CrocoTV 仓库运行 `npm run build` 后重新安装 Plugin；不要临时安装全局依赖。
- 缺少配置时，只报告 `.codex/.env.example` 中的变量名，不得输出密钥。
- Surface API errors. Never overwrite an exact output file.
- Never duplicate API logic, use Supabase, or fall back to another voice/provider.
