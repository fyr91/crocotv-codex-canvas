import { Beaker, BookMarked, Images, Maximize2, Workflow } from "lucide-react";

export const navigationTools = [
    {
        slug: "content",
        label: "内容生产中心",
        icon: Workflow,
    },
    {
        slug: "content-factory",
        label: "内容工厂实验室",
        icon: Beaker,
    },
    {
        slug: "canvas",
        label: "我的画布",
        icon: Maximize2,
    },
    {
        slug: "assets",
        label: "我的素材",
        icon: Images,
    },
    {
        slug: "prompts",
        label: "我的提示词",
        icon: BookMarked,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
