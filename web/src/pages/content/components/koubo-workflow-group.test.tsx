import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KouboWorkflowGroup } from "./koubo-workflow-group";

describe("KouboWorkflowGroup", () => {
    it("exposes a keyboard-selectable group header without canvas gesture capture", () => {
        const html = renderToStaticMarkup(
            <KouboWorkflowGroup title="口播文案组" selected completed={0} total={0} onSelect={() => undefined}>
                <p>空状态</p>
            </KouboWorkflowGroup>,
        );

        expect(html).toContain('aria-pressed="true"');
        expect(html).toContain("选择口播文案组");
        expect(html).toContain("data-canvas-no-zoom");
    });
});
