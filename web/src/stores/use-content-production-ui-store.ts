import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { ViewportTransform } from "@/types/canvas";

export type ContentHubTab = "workspace" | "pool" | "completed" | "statistics";
export type ContentNotificationMode = "mute" | "all";
export type ContentTopicViewState = { focusedNodeId: string | null; viewport: ViewportTransform };

type ContentProductionUiStore = {
    activeTab: ContentHubTab;
    notificationMode: ContentNotificationMode;
    topicViews: Record<string, ContentTopicViewState>;
    setActiveTab: (activeTab: ContentHubTab) => void;
    setNotificationMode: (notificationMode: ContentNotificationMode) => void;
    setTopicView: (topicId: string, view: ContentTopicViewState) => void;
    clearTopicView: (topicId: string) => void;
};

const memory = new Map<string, string>();
const memoryStorage: StateStorage = {
    getItem: (name) => memory.get(name) || null,
    setItem: (name, value) => { memory.set(name, value); },
    removeItem: (name) => { memory.delete(name); },
};

export const useContentProductionUiStore = create<ContentProductionUiStore>()(
    persist(
        (set) => ({
            activeTab: "workspace",
            notificationMode: "all",
            topicViews: {},
            setActiveTab: (activeTab) => set({ activeTab }),
            setNotificationMode: (notificationMode) => set({ notificationMode }),
            setTopicView: (topicId, view) => set((state) => ({ topicViews: { ...state.topicViews, [topicId]: view } })),
            clearTopicView: (topicId) => set((state) => {
                const topicViews = { ...state.topicViews };
                delete topicViews[topicId];
                return { topicViews };
            }),
        }),
        {
            name: "crocotv:content-production-ui",
            storage: createJSONStorage(() => typeof window === "undefined" ? memoryStorage : window.localStorage),
            partialize: ({ activeTab, notificationMode, topicViews }) => ({ activeTab, notificationMode, topicViews }),
        },
    ),
);
