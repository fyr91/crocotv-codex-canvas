import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CanvasNodeContextMenu } from "./canvas-context-menu";

const projectSource = readFileSync(new URL("../../pages/canvas/project.tsx", import.meta.url), "utf8");
const noop = vi.fn();

function renderMenu(canExportSelected: boolean) {
    return renderToStaticMarkup(
        <CanvasNodeContextMenu
            menu={{ type: "node", x: 10, y: 20, nodeId: "image-1" }}
            canCreateGroup
            canDelete
            canExportSelected={canExportSelected}
            selectedExportCount={3}
            onClose={noop}
            onDuplicate={noop}
            onDuplicateSelectedText={noop}
            onCreateGroup={noop}
            onExportSelected={noop}
            onDelete={noop}
        />,
    );
}

describe("CanvasNodeContextMenu", () => {
    it("shows package download for selected canvas results", () => {
        expect(renderMenu(true)).toContain("打包下载（3）");
        expect(renderMenu(false)).not.toContain("打包下载");
    });

    it("keeps the prompt panel hidden after box selection becomes a multi-selection", () => {
        expect(projectSource).toMatch(/showPanel=\{[^}]*!hasMultipleSelectedNodes[^}]*selectedNodeIds\.has\(node\.id\)/);
    });
});
