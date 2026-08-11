import { rename, writeFile } from "node:fs/promises";

export function validateImageReview(review) {
    if (!Number.isInteger(review?.attempt) || review.attempt < 1 || review.attempt > 5) throw new Error("attempt 必须为 1-5");
    if (!Number.isFinite(review.score) || review.score < 0 || review.score > 100) throw new Error("score 必须为 0-100");
    if (!Array.isArray(review.criticalIssues) || !review.criteria || typeof review.criteria !== "object") throw new Error("验收字段不完整");
    if (review.status === "pass" && (review.score < 85 || review.criticalIssues.length)) throw new Error("通过验收需要至少 85 分且无关键错误");
    if (!["pass", "fail"].includes(review.status)) throw new Error("status 必须为 pass 或 fail");
    return review;
}

export async function selectBestAttempt({ reviews }) {
    const valid = reviews.map(validateImageReview);
    const passed = valid.find((item) => item.status === "pass");
    const best = passed || [...valid].sort((a, b) => b.score - a.score)[0];
    if (!best) throw new Error("没有可选择的生成记录");
    return { attempt: best.attempt, imagePath: best.imagePath, status: passed ? "pass" : "failed-best-effort", manualReviewRequired: !passed, score: best.score };
}

export async function recordImageReview({ review, reviewPath, pointerPath, reviews = [] }) {
    validateImageReview(review);
    await atomicJson(reviewPath, review);
    const all = [...reviews, review];
    if (review.status === "pass" || review.attempt === 5) await atomicJson(pointerPath, await selectBestAttempt({ reviews: all }));
}

async function atomicJson(target, value) {
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, target);
}
