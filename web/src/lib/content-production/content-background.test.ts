import { describe, expect, it } from "vitest";

import { CONTENT_BACKGROUND_FIELDS, isContentBackgroundComplete } from "./content-background";

describe("content background contract", () => {
    it("contains exactly the eight fixed fields with samples", () => {
        expect(CONTENT_BACKGROUND_FIELDS.map((field) => field.name)).toEqual([
            "contentGoal",
            "targetAudience",
            "marketLanguage",
            "primaryPlatforms",
            "contentFormat",
            "defaultDurationSeconds",
            "defaultAspectRatio",
            "expressionStyle",
        ]);
        expect(CONTENT_BACKGROUND_FIELDS.every((field) => field.description && field.sample)).toBe(true);
    });

    it("requires meaningful values before Topic creation", () => {
        expect(isContentBackgroundComplete({
            contentGoal: "",
            targetAudience: "",
            marketLanguage: "",
            primaryPlatforms: [],
            contentFormat: "",
            defaultDurationSeconds: 60,
            defaultAspectRatio: "9:16",
            expressionStyle: "",
            version: 1,
            updatedAt: "",
        })).toBe(false);
        expect(isContentBackgroundComplete({
            contentGoal: "建立育儿 IP",
            targetAudience: "25–40 岁父母",
            marketLanguage: "中国大陆，简体中文",
            primaryPlatforms: ["抖音", "小红书"],
            contentFormat: "IP 角色剧情＋育儿科普",
            defaultDurationSeconds: 60,
            defaultAspectRatio: "9:16",
            expressionStyle: "温暖、幽默、节奏紧凑",
            version: 1,
            updatedAt: "",
        })).toBe(true);
    });
});
