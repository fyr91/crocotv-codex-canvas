import { beforeEach, describe, expect, it } from "vitest";

import { useContentProductionUiStore } from "./use-content-production-ui-store";

beforeEach(() => {
    useContentProductionUiStore.setState({
        activeTab: "workspace",
        notificationMode: "all",
        topicViews: {},
    });
});

describe("useContentProductionUiStore", () => {
    it("stores only cross-page view state and notification preference", () => {
        useContentProductionUiStore.getState().setTopicView("topic-1", {
            focusedNodeId: "node-1",
            viewport: { x: 10, y: 20, k: 0.8 },
        });
        useContentProductionUiStore.getState().setNotificationMode("mute");

        expect(useContentProductionUiStore.getState().topicViews["topic-1"]).toEqual({
            focusedNodeId: "node-1",
            viewport: { x: 10, y: 20, k: 0.8 },
        });
        expect(useContentProductionUiStore.getState().notificationMode).toBe("mute");
        expect("topics" in useContentProductionUiStore.getState()).toBe(false);
    });
});
