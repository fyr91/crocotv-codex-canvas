import { describe, expect, it } from "vitest";

import { parseStructuredOutput, topicModuleState } from "./content-stage";

describe("parseStructuredOutput", () => {
    it("accepts a fenced JSON object with all required keys", () => {
        expect(parseStructuredOutput("```json\n{\"storyline\":{},\"script\":[]}\n```", ["storyline", "script"])).toEqual({
            storyline: {},
            script: [],
        });
    });

    it("rejects malformed or incomplete output", () => {
        expect(() => parseStructuredOutput("{bad json", ["script"])).toThrow("AI 输出不是有效 JSON");
        expect(() => parseStructuredOutput('{"storyline":{}}', ["storyline", "script"])).toThrow("AI 输出缺少字段：script");
    });
});

describe("topicModuleState", () => {
    it("uses failure, attention, unread, running, idle priority", () => {
        expect(topicModuleState({ failures: 1, attention: 2, unread: 3, running: 4, completed: false }).kind).toBe("failure");
        expect(topicModuleState({ failures: 0, attention: 2, unread: 3, running: 4, completed: false }).kind).toBe("attention");
        expect(topicModuleState({ failures: 0, attention: 0, unread: 3, running: 4, completed: false }).kind).toBe("unread");
        expect(topicModuleState({ failures: 0, attention: 0, unread: 0, running: 4, completed: false }).kind).toBe("running");
        expect(topicModuleState({ failures: 0, attention: 0, unread: 0, running: 0, completed: true }).kind).toBe("completed");
        expect(topicModuleState({ failures: 0, attention: 0, unread: 0, running: 0, completed: false }).kind).toBe("idle");
    });
});
