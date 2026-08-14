#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function sanitizeTopicName(topic) {
    const value = String(topic || "").replace(/[\\/:*?"<>|]/g, "").replace(/[。！？.!?]+$/u, "").trim().replace(/[. ]+$/g, "");
    if (!value) throw new Error("Topic 不能生成有效目录名称");
    return [...value].slice(0, 48).join("");
}

export function projectDirectoryName(topic, now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}-${sanitizeTopicName(topic)}`;
}

export function validateProjectInput(input) {
    for (const [field, label] of [["topic", "Topic"], ["targetAudience", "目标用户"], ["contentDirection", "内容方向"], ["productionControl", "生产控制"], ["executionBackend", "执行后端"]]) {
        if (!String(input?.[field] || "").trim()) throw new Error(`缺少${label}`);
    }
    const productionControl = String(input.productionControl).trim();
    const executionBackend = String(input.executionBackend).trim();
    if (!["Auto", "互动"].includes(productionControl)) throw new Error("生产控制必须为 Auto 或互动");
    if (!["本地 Canvas", "Canvas", "Skill 原生", "原生"].includes(executionBackend)) throw new Error("执行后端必须为本地 Canvas 或 Skill 原生");
    if (input.aspectRatio && !["16:9", "9:16", "4:3", "3:4"].includes(String(input.aspectRatio).trim())) throw new Error("aspectRatio 必须为 16:9、9:16、4:3 或 3:4");
}

export async function createVideoProject(input) {
    validateProjectInput(input);
    const pipelineRoot = path.resolve(String(input.pipelineRoot || ""));
    const projectDir = path.join(pipelineRoot, "Projects", projectDirectoryName(input.topic, input.now));
    for (const directory of ["内容策划", path.join("角色", "临时NPC"), "场景", "导演策划", "分镜", "运行状态"]) await mkdir(path.join(projectDir, directory), { recursive: true });
    const config = {
        schemaVersion: 1,
        topic: String(input.topic).trim(),
        targetAudience: String(input.targetAudience).trim(),
        contentDirection: String(input.contentDirection).trim(),
        productionControl: String(input.productionControl || "").trim(),
        executionBackend: String(input.executionBackend || "").trim(),
        aspectRatio: String(input.aspectRatio || "16:9").trim(),
        publishingEnvironment: String(input.publishingEnvironment || "").trim(),
        mainCharacters: Array.isArray(input.mainCharacters) ? input.mainCharacters : [],
        userDefinedNpcs: Array.isArray(input.userDefinedNpcs) ? input.userDefinedNpcs : [],
        visualStyle: String(input.visualStyle || "").trim()
            ? { source: "user", value: String(input.visualStyle).trim() }
            : { source: "inferred-later", value: "" },
        maxDurationSeconds: Math.min(120, Math.max(3, Number(input.maxDurationSeconds || 90))),
        status: "p1-initialized",
        createdAt: (input.now || new Date()).toISOString(),
    };
    const configPath = path.join(projectDir, "项目配置.json");
    const temporary = `${configPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await rename(temporary, configPath);
    return { projectDir, configPath, config };
}

function parseArgs(argv) {
    if (argv.length !== 2 || argv[0] !== "--input") throw new Error("用法：--input /absolute/path/to/project-input.json");
    return argv[1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const inputPath = path.resolve(parseArgs(process.argv.slice(2)));
        const input = JSON.parse(await readFile(inputPath, "utf8"));
        const pipelineRoot = path.resolve(process.cwd());
        console.log((await createVideoProject({ pipelineRoot, ...input })).projectDir);
    } catch (error) {
        console.error(`错误：${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
