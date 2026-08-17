import { Clapperboard, Images, Maximize2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { studioOrigin } from "@/lib/studio-origin";

const navigationItems = [
    { to: "/canvas", label: "我的画布", icon: Maximize2 },
    { to: studioOrigin, matchPath: "/studio", label: "视频工坊", icon: Clapperboard, external: true },
    { to: "/assets", label: "本地素材", icon: Images },
];

export function AppTopNav() {
    const { pathname } = useLocation();
    if (/^\/canvas\/[^/]+/.test(pathname)) return null;
    return <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800">
        <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-6">
            <div className="flex min-w-0 items-center">
                <Link to="/canvas" className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-50 dark:hover:text-stone-300">
                    <img src="/favicon.png" alt="" className="size-5 shrink-0" /><span className="text-base font-medium">CrocoTV</span>
                </Link>
                <nav aria-label="主导航" className="ml-8 flex h-14 min-w-0 items-center gap-7">
                    {navigationItems.map((item) => {
                        const active = pathname.startsWith(item.matchPath || item.to);
                        const Icon = item.icon;
                        const className = `relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px ${active ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-50 dark:after:bg-stone-50" : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-50"}`;
                        const content = <><Icon aria-hidden="true" className="size-4" /><span>{item.label}</span></>;
                        return item.external
                            ? <a key={item.to} href={item.to} className={className}>{content}</a>
                            : <Link key={item.to} to={item.to} aria-current={active ? "page" : undefined} className={className}>{content}</Link>;
                    })}
                </nav>
            </div>
            <div className="my-auto flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400"><span>本地模式</span><UserStatusActions /></div>
        </div>
    </header>;
}
