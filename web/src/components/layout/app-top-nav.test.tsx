import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppTopNav } from "./app-top-nav";

describe("AppTopNav", () => {
    it("shows the Video Workshop navigation between Canvas and local assets", () => {
        const html = renderToStaticMarkup(
            <MemoryRouter initialEntries={["/studio"]}>
                <AppTopNav />
            </MemoryRouter>,
        );

        expect(html.indexOf("我的画布")).toBeLessThan(html.indexOf("视频工坊"));
        expect(html.indexOf("视频工坊")).toBeLessThan(html.indexOf("本地素材"));
        expect(html).toContain("视频工坊");
        expect(html).toMatch(/href="(?:http:\/\/localhost:3010|\/studio\/?)"/);
    });
});
