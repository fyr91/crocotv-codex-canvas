import { Drawer, Tabs } from "antd";
import { useState } from "react";

import { ContentModelPromptTuning } from "../../components/content-model-prompt-tuning";

export function PromptTuningDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [dirty, setDirty] = useState(false);
    return (
        <Drawer open={open} onClose={onClose} width={720} title="Course Flow 提示词调优" destroyOnClose maskClosable={!dirty}>
            <Tabs items={[
                { key: "course_script", label: "课程文案", children: <ContentModelPromptTuning run={null} fallbackStage="course_script" onDirtyChange={setDirty} /> },
                { key: "course_scene", label: "课程场景", children: <ContentModelPromptTuning run={null} fallbackStage="course_scene" onDirtyChange={setDirty} /> },
                { key: "course_video", label: "课程视频", children: <ContentModelPromptTuning run={null} fallbackStage="course_video" onDirtyChange={setDirty} /> },
            ]} />
        </Drawer>
    );
}
