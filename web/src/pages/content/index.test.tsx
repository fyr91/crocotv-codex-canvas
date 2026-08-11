import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ContentPage from "./index";

vi.mock("./use-content-production", () => ({
    useContentProductionRealtime: vi.fn(),
    useContentTopicsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/stores/use-user-store", () => ({
    useUserStore: (selector: (state: { profile: null }) => unknown) => selector({ profile: null }),
}));

vi.mock("@/stores/use-content-production-ui-store", () => ({
    useContentProductionUiStore: (selector: (state: { activeTab: string; setActiveTab: () => void }) => unknown) =>
        selector({
            activeTab: "completed",
            setActiveTab: vi.fn(),
        }),
}));

describe("ContentPage completed state", () => {
    it("uses the same checkable tag treatment as the asset type filters", () => {
        const html = renderToStaticMarkup(
            <MemoryRouter>
                <ContentPage />
            </MemoryRouter>,
        );

        expect(html).toContain("filter-chip");
        expect(html).toContain("content-hub-tab");
        expect(html).not.toContain("ant-segmented");
        expect(html.indexOf("我的工作台")).toBeLessThan(html.indexOf("公共 Topic 池"));
    });

    it("uses the full content width for the empty notice instead of placing it in the first card column", () => {
        const html = renderToStaticMarkup(
            <MemoryRouter>
                <ContentPage />
            </MemoryRouter>,
        );

        expect(html).toContain("还没有已完成 Topic");
        expect(html).not.toContain("md:grid-cols-2");
    });
});
