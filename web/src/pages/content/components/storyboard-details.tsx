import { Button, Collapse, Descriptions, Empty, Tag } from "antd";
import { Play } from "lucide-react";
import type { ReactNode } from "react";

import { contentStoryboardSnapshot } from "@/lib/content-production/storyboard";
import type { ContentNode } from "@/types/content-production";
import { ContentNodePanelTabs, type ContentNodePanelTab } from "./content-node-panel-tabs";

export function StoryboardDetails({
    node,
    editable,
    generating,
    panelTab,
    tuningEnabled,
    tuning,
    onPanelTabChange,
    onContinue,
}: {
    node: ContentNode;
    editable: boolean;
    generating: boolean;
    panelTab: ContentNodePanelTab;
    tuningEnabled: boolean;
    tuning: ReactNode;
    onPanelTabChange: (tab: ContentNodePanelTab) => void;
    onContinue: () => Promise<void>;
}) {
    const snapshot = contentStoryboardSnapshot(node);
    if (!snapshot) return null;
    const content = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs text-muted-foreground">{node.nodeType === "batch" ? "分镜脚本" : "单分镜节点"}</div>
                        <h2 className="mt-1 font-semibold">{node.title}</h2>
                    </div>
                    <Tag>{snapshot.phase === "accepted" ? "已完成" : snapshot.phase === "producer_running" ? "生成中" : snapshot.phase === "canceled" ? "已停止" : "失败"}</Tag>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5" data-canvas-scroll>
                {snapshot.header ? <StoryboardHeaderView header={snapshot.header} /> : null}
                {snapshot.node ? <StoryboardNodeView node={snapshot.node} /> : null}
                {!snapshot.header && !snapshot.node ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={snapshot.lastError || "分镜内容正在生成"} /> : null}
                {snapshot.node && snapshot.phase === "accepted" ? (
                    <Button
                        className="mt-5"
                        type="primary"
                        disabled={!editable}
                        loading={generating}
                        icon={<Play className="size-4" />}
                        onClick={() => void onContinue()}
                    >
                        生成分镜提示词
                    </Button>
                ) : null}
            </div>
        </div>
    );
    return (
        <ContentNodePanelTabs
            activeKey={panelTab}
            tuningEnabled={tuningEnabled}
            content={content}
            tuning={tuning}
            contentWidthClass="w-[430px]"
            onChange={onPanelTabChange}
        />
    );
}

function StoryboardHeaderView({ header }: { header: NonNullable<ReturnType<typeof contentStoryboardSnapshot>>["header"] }) {
    if (!header) return null;
    return (
        <div className="space-y-5">
            <div>
                <div className="text-lg font-semibold">{header.storyline_title}</div>
                <div className="mt-1 text-sm text-muted-foreground">共 {header.total_nodes} 个分镜节点</div>
            </div>
            <section>
                <div className="mb-2 text-sm font-medium">角色</div>
                <div className="space-y-2">
                    {header.metadata.defined_characters.map((character) => (
                        <div key={character.character_id} className="rounded-xl border border-border p-3">
                            <div className="font-medium">{character.name} <Tag className="ml-1">{character.character_id}</Tag></div>
                            <div className="mt-2 text-sm leading-6 text-muted-foreground">{character.visual_summary}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Voice：{character.voice_style}</div>
                        </div>
                    ))}
                </div>
            </section>
            <section>
                <div className="mb-2 text-sm font-medium">场景</div>
                <div className="space-y-2">
                    {header.metadata.defined_scenes.map((scene) => (
                        <div key={scene.scene_id} className="rounded-xl border border-border p-3">
                            <div className="font-medium">{scene.name} <Tag className="ml-1">{scene.scene_id}</Tag></div>
                            <div className="mt-2 text-sm leading-6 text-muted-foreground">{scene.visual_summary}</div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function StoryboardNodeView({ node }: { node: NonNullable<ReturnType<typeof contentStoryboardSnapshot>>["node"] }) {
    if (!node) return null;
    return (
        <div className="space-y-4">
            <Descriptions
                size="small"
                column={1}
                items={[
                    { key: "scene", label: "场景", children: `${node.scene_id} · Scene ${node.scene_number}` },
                    { key: "characters", label: "角色", children: node.characters_present.length ? node.characters_present.join("、") : "无" },
                    { key: "function", label: "叙事功能", children: node.narrative_function },
                    { key: "transition", label: "转场", children: `${node.transition_in} → ${node.transition_out}` },
                    { key: "camera", label: "镜头", children: `${node.cinematography.shot_type} · ${node.cinematography.camera_movement} · ${node.cinematography.camera_angle}` },
                ]}
            />
            <Collapse
                size="small"
                defaultActiveKey={["script", "keyframes"]}
                items={[
                    {
                        key: "script",
                        label: "脚本与声音",
                        children: (
                            <div className="space-y-3 text-sm leading-6">
                                <p>{node.script_content.visual_summary}</p>
                                {node.script_content.dialogue_lines.map((line) => (
                                    <div key={line.line_id} className="rounded-lg bg-muted/50 p-3">
                                        <div className="font-medium">{line.speaker}{line.listener ? ` → ${line.listener}` : ""} · {line.timing_offset}</div>
                                        <div className="mt-1">{line.text}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">{line.emotion_tone} · {line.audio_tts_prompt}</div>
                                    </div>
                                ))}
                                <div className="text-muted-foreground">SFX：{node.script_content.audio_sfx}</div>
                                <div className="text-muted-foreground">BGM：{node.script_content.bgm_mood}</div>
                            </div>
                        ),
                    },
                    {
                        key: "keyframes",
                        label: `关键帧（${node.keyframes.length}）`,
                        children: (
                            <div className="space-y-3">
                                {node.keyframes.map((frame) => (
                                    <div key={frame.frame_id} className="rounded-lg border border-border p-3 text-sm">
                                        <div className="font-medium">{frame.frame_id} · {frame.timestamp_or_action}</div>
                                        <div className="mt-2 leading-6">{frame.image_prompt}</div>
                                        <div className="mt-2 text-xs text-muted-foreground">Negative：{frame.negative_prompt}</div>
                                    </div>
                                ))}
                            </div>
                        ),
                    },
                ]}
            />
        </div>
    );
}
