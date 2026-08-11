import { Drawer, Grid, Tabs } from "antd";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ContentNodePanelTab = "content" | "tuning";

export function ContentNodePanelTabs({
    activeKey,
    tuningEnabled,
    content,
    tuning,
    contentWidthClass = "w-[410px]",
    onChange,
}: {
    activeKey: ContentNodePanelTab;
    tuningEnabled: boolean;
    content: ReactNode;
    tuning: ReactNode;
    contentWidthClass?: string;
    onChange: (key: ContentNodePanelTab) => void;
}) {
    const screens = Grid.useBreakpoint();
    const desktop = screens.md !== false;
    const current = tuningEnabled ? activeKey : "content";
    const body = (
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-canvas-no-zoom>
            {tuningEnabled ? (
                <Tabs
                    className="shrink-0"
                    activeKey={current}
                    items={[
                        { key: "content", label: "节点内容" },
                        { key: "tuning", label: "提示词调优" },
                    ]}
                    styles={{ header: { margin: 0, paddingInline: 24 } }}
                    onChange={(key) => onChange(key as ContentNodePanelTab)}
                />
            ) : null}
            <div className="min-h-0 flex-1">
                {current === "tuning" && tuningEnabled ? tuning : content}
            </div>
        </div>
    );

    if (!desktop) {
        return (
            <Drawer
                open
                placement="right"
                closable={false}
                mask={false}
                getContainer={false}
                width={current === "tuning" ? "min(520px, 100vw)" : "min(420px, 100vw)"}
                styles={{ body: { padding: 0 } }}
            >
                {body}
            </Drawer>
        );
    }

    return (
        <aside className={cn(
            "h-full shrink-0 border-l border-border bg-background transition-[width] duration-150",
            current === "tuning" ? "w-[520px]" : contentWidthClass,
        )}>
            {body}
        </aside>
    );
}
