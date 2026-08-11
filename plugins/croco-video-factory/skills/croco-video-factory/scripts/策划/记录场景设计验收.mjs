#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../音频/火山ASR.mjs";

const requiredChecks = ["spatial-layout", "lighting-palette", "materials-props", "camera-coverage", "clean-no-text"];

export async function recordSceneReview({ viewDir, attempt, verdict, reviewer, checks = [], issues = [] } = {}) {
    const directory = path.resolve(String(viewDir || ""));
    const number = Number(attempt);
    if (!viewDir || !Number.isInteger(number) || number < 1 || number > 5) throw new Error("必须提供 --view-dir 和 1–5 的 --attempt");
    if (!["pass", "fail"].includes(verdict)) throw new Error("--record 只能是 pass 或 fail");
    if (!reviewer) throw new Error("必须提供 --reviewer");
    const imagePath = path.join(directory, `场景设计图-第${String(number).padStart(2, "0")}次.png`);
    await stat(imagePath);
    const uniqueChecks = [...new Set(checks)];
    if (verdict === "pass") {
        const missing = requiredChecks.filter((item) => !uniqueChecks.includes(item));
        if (missing.length) throw new Error(`场景设计验收缺少 checks：${missing.join(", ")}`);
        if (issues.length) throw new Error("PASS 不得包含 issues");
    } else if (!issues.length) throw new Error("FAIL 必须提供 --issues");
    const review = { schemaVersion: 1, status: verdict, attempt: number, reviewer: String(reviewer), checks: uniqueChecks, issues, imagePath: path.basename(imagePath), imageSha256: createHash("sha256").update(await readFile(imagePath)).digest("hex"), reviewedAt: new Date().toISOString() };
    await atomicJson(path.join(directory, `场景设计验收-第${String(number).padStart(2, "0")}次.json`), review);
    if (verdict === "pass") await atomicJson(path.join(directory, "当前场景设计图.json"), { status: "pass", attempt: number, imagePath: path.basename(imagePath), imageSha256: review.imageSha256, reviewer: review.reviewer });
    return review;
}

async function atomicJson(target, value) { await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, target); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = parseArgs(process.argv.slice(2));
        const review = await recordSceneReview({ viewDir: args["view-dir"], attempt: args.attempt, verdict: String(args.record || ""), reviewer: args.reviewer, checks: String(args.checks || "").split(",").map((item) => item.trim()).filter(Boolean), issues: String(args.issues || "").split("|").map((item) => item.trim()).filter(Boolean) });
        console.log(JSON.stringify(review));
        if (review.status === "fail") process.exitCode = 2;
    } catch (error) { console.error(`错误：${error.message}`); process.exitCode = 1; }
}
