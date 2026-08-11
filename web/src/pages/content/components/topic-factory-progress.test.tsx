import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopicFactoryProgress } from "./topic-factory-progress";

describe("TopicFactoryProgress", () => {
    it("shows independent lane progress without a completion gate", () => {
        const html = renderToStaticMarkup(<TopicFactoryProgress
            summary={{ readyPass: 1, readyWarning: 0, reviewing: 1, generating: 2, revising: 1, humanizing: 0, failed: 0 }}
            total={5}
            selectedPath={["Topic", "选题 A"]}
        />);

        expect(html).toContain("已通过 1");
        expect(html).toContain("生成中 2");
        expect(html).toContain("验证中 1");
        expect(html).toContain("调整中 1");
        expect(html).not.toContain("5/5");
        expect(html).toContain("Topic");
        expect(html).toContain("选题 A");
    });
});
