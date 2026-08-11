import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceProjectActivity, WorkspaceProjectHeader, WorkspaceProjectMetrics } from "./workspace-project-card-parts";

describe("workspace project card parts", () => {
    it("keeps shared Topic and koubo typography and spacing contracts", () => {
        const html = renderToStaticMarkup(
            <>
                <WorkspaceProjectHeader title="口播视频" />
                <WorkspaceProjectMetrics items={[{ label: "已完成", value: 1 }, { label: "运行中", value: 2 }, { label: "失败", value: 0 }]} />
                <WorkspaceProjectActivity message="暂无新的生成动态" />
            </>,
        );

        expect(html).toContain("line-clamp-2 text-base font-semibold leading-6");
        expect(html).not.toContain("草稿");
        expect(html).not.toContain("lucide-circle");
        expect(html).toContain("text-[11px] text-muted-foreground");
        expect(html).toContain("line-clamp-2 rounded-xl");
        expect(html).toContain("暂无新的生成动态");
    });
});
