import { App } from "antd";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopicOrientationForm } from "./topic-orientation-form";

describe("TopicOrientationForm", () => {
    it("renders a single-column form with stacked captions and a full-width action", () => {
        const html = renderToStaticMarkup(
            <App>
                <TopicOrientationForm
                    initialValue={null}
                    saving={false}
                    onSave={async () => undefined}
                    onSubmit={async () => undefined}
                    submitLabel="生成选题分支"
                    compact
                />
            </App>,
        );

        expect(html).not.toContain("lucide-compass");
        expect(html).not.toContain("md:grid-cols-2");
        expect(html.match(/<small/g)).toHaveLength(8);
        expect(html).toContain("[&amp;_.ant-space-compact]:w-full");
        expect(html).toContain("ant-btn-block");
    });
});
