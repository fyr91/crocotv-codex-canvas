import { ArrowRight } from "lucide-react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";

import { navigationTools } from "@/constant/navigation-tools";

export default function IndexPage() {
    const navigate = useNavigate();
    const [primaryTool] = navigationTools;

    return (
        <main className="ui-dot-pattern relative h-full overflow-y-auto bg-[var(--surface-app)] text-foreground">
            <section className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-6">
                <div className="relative flex min-h-[620px] flex-col items-center justify-center pt-10 text-center">
                    <h1 className="ai-title-aurora max-w-5xl text-balance text-5xl font-semibold tracking-normal sm:text-7xl lg:text-8xl">CrocoTV 画布</h1>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                        <Button type="primary" size="large" onClick={() => navigate(`/${primaryTool.slug}`)} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            开始使用
                        </Button>
                        <Button size="large" onClick={() => navigate("/canvas")}>
                            打开画布
                        </Button>
                    </div>
                </div>
            </section>
        </main>
    );
}
