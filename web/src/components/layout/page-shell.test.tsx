import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LibraryPage } from "./page-shell";

describe("LibraryPage", () => {
    it("matches the asset library page hierarchy with a dotted background and centered purpose", () => {
        const html = renderToStaticMarkup(
            <LibraryPage title="内容生产中心" description="管理内容生产任务。">
                <div>页面内容</div>
            </LibraryPage>,
        );

        expect(html).toContain("ui-library-page");
        expect(html).toContain("text-center");
        expect(html).toContain("ui-library-title");
        expect(html).toContain("管理内容生产任务。");
        expect(html).toContain("页面内容");
    });
});
