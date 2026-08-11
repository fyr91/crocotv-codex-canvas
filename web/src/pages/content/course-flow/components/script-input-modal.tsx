import { Button, Form, Input, Modal, Radio, Select } from "antd";
import { useEffect, useState } from "react";

import type { CourseFlowMode, CourseFlowProject, CourseFlowSegment, CourseSceneAspectRatio } from "@/types/course-flow";

export type CourseScriptInput =
    | { mode: "generated"; topic: string; audience: string; extraPrompt: string; sceneMode: CourseFlowMode; sceneAspectRatio: CourseSceneAspectRatio }
    | { mode: "pasted"; text: string; sceneMode: CourseFlowMode; sceneAspectRatio: CourseSceneAspectRatio };

type ScriptInputFormProps = {
    initialAspectRatio: CourseSceneAspectRatio;
    initialInput?: CourseScriptInput | null;
    projectSceneMode?: CourseFlowMode | null;
    ratioOptions: Array<{ label: string; value: CourseSceneAspectRatio }>;
    submitting?: boolean;
    onCancel?: () => void;
    onSubmit: (values: CourseScriptInput) => void;
};

export function buildCourseScriptInitialInput(project: CourseFlowProject, segments: CourseFlowSegment[]): CourseScriptInput | null {
    const sceneMode = project.sceneMode || "general";
    if (project.sourceType === "pasted") return {
        mode: "pasted",
        text: [...segments].sort((left, right) => left.position - right.position).map((segment) => segment.text).join("\n\n"),
        sceneMode,
        sceneAspectRatio: project.sceneAspectRatio,
    };
    if (project.sourceType === "generated") return {
        mode: "generated",
        topic: project.topic,
        audience: project.audience,
        extraPrompt: project.extraPrompt,
        sceneMode,
        sceneAspectRatio: project.sceneAspectRatio,
    };
    return null;
}

export function ScriptInputForm({ initialAspectRatio, initialInput = null, projectSceneMode = null, ratioOptions, submitting = false, onCancel, onSubmit }: ScriptInputFormProps) {
    const [mode, setMode] = useState<"generated" | "pasted">("generated");
    const [form] = Form.useForm();
    const selectedSceneMode = Form.useWatch("sceneMode", form) || projectSceneMode || "general";
    useEffect(() => {
        setMode(initialInput?.mode || "generated");
        form.resetFields();
        form.setFieldsValue({
            ...(initialInput || {}),
            sceneMode: projectSceneMode || initialInput?.sceneMode || "general",
            sceneAspectRatio: initialInput?.sceneAspectRatio || initialAspectRatio,
        });
    }, [form, initialAspectRatio, initialInput, projectSceneMode]);
    const submit = async () => {
        const values = await form.validateFields();
        onSubmit(mode === "generated" ? { mode, topic: values.topic, audience: values.audience, extraPrompt: values.extraPrompt || "", sceneMode: values.sceneMode, sceneAspectRatio: values.sceneAspectRatio } : { mode, text: values.text, sceneMode: values.sceneMode, sceneAspectRatio: values.sceneAspectRatio });
    };
    return (
        <>
            <Radio.Group className="mb-5" value={mode} onChange={(event) => setMode(event.target.value)} options={[{ label: "生成课程文案", value: "generated" }, { label: "粘贴自己的文案", value: "pasted" }]} optionType="button" buttonStyle="solid" />
            <Form form={form} layout="vertical" requiredMark="optional" disabled={submitting} onFinish={() => void submit()}>
                {mode === "generated" ? <>
                    <Form.Item name="topic" label="课程主题" rules={[{ required: true, whitespace: true, message: "请输入课程主题" }]}><Input placeholder="例如：生成式 AI 如何改变日常工作" /></Form.Item>
                    <Form.Item name="audience" label="目标受众" rules={[{ required: true, whitespace: true, message: "请输入目标受众" }]}><Input placeholder="例如：希望提升效率的职场新人" /></Form.Item>
                    <Form.Item name="extraPrompt" label="额外提示词"><Input.TextArea rows={3} placeholder="语气、时长或需要重点说明的内容" /></Form.Item>
                </> : <Form.Item name="text" label="完整文案" rules={[{ required: true, whitespace: true, message: "请粘贴完整文案" }]}><Input.TextArea rows={10} placeholder="粘贴后将立即由模型精确自动分段，不会改写原文。" /></Form.Item>}
                <Form.Item name="sceneMode" label="课程类型" rules={[{ required: true, message: "请选择课程类型" }]}><Select disabled={projectSceneMode !== null} options={[{ value: "general", label: "通用课程视频" }, { value: "green_screen", label: "绿幕课程视频" }]} /></Form.Item>
                <Form.Item name="sceneAspectRatio" label="画面比例" rules={[{ required: true, message: "请选择画面比例" }]}><Select options={ratioOptions} /></Form.Item>
                <div className="flex justify-end gap-2">
                    {onCancel ? <Button onClick={onCancel}>取消</Button> : null}
                    <Button type="primary" htmlType="submit" loading={submitting}>{selectedSceneMode === "green_screen" ? mode === "generated" ? "生成文案与场景" : "自动分段并生成场景" : mode === "generated" ? "生成课程文案" : "自动整理课程文案"}</Button>
                </div>
            </Form>
        </>
    );
}

export function ScriptInputModal({ open, initialAspectRatio, initialInput = null, projectSceneMode = null, ratioOptions, onClose, onSubmit }: { open: boolean; initialAspectRatio: CourseSceneAspectRatio; initialInput?: CourseScriptInput | null; projectSceneMode?: CourseFlowMode | null; ratioOptions: Array<{ label: string; value: CourseSceneAspectRatio }>; onClose: () => void; onSubmit: (values: CourseScriptInput) => void }) {
    return (
        <Modal open={open} title="重新填写课程需求" onCancel={onClose} footer={null} destroyOnHidden>
            <ScriptInputForm initialAspectRatio={initialAspectRatio} initialInput={initialInput} projectSceneMode={projectSceneMode} ratioOptions={ratioOptions} onCancel={onClose} onSubmit={onSubmit} />
        </Modal>
    );
}
