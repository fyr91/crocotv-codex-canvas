import { canvasProjectDocument } from "@/lib/canvas/canvas-project-document";
import { supabase } from "@/lib/supabase/client";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { UserProfile } from "@/stores/use-user-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasTemplateStatus = "pending" | "published" | "rejected" | "withdrawn";
export type CanvasTemplateDocument = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode?: "lines";
    showImageInfo: boolean;
    viewport: ViewportTransform;
};
export type CanvasTemplate = {
    id: string;
    sourceProjectId: string | null;
    creatorId: string;
    creatorName: string;
    title: string;
    description: string;
    document: CanvasTemplateDocument;
    status: CanvasTemplateStatus;
    rejectionReason: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

type CanvasTemplateRow = {
    id: string;
    source_project_id: string | null;
    creator_id: string;
    creator_name: string;
    title: string;
    description: string;
    document: CanvasTemplateDocument;
    status: CanvasTemplateStatus;
    rejection_reason: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
};

export async function listPublishedCanvasTemplates() {
    const { data, error } = await supabase.from("canvas_templates").select("*").eq("status", "published").order("published_at", { ascending: false });
    if (error) throw error;
    return (data as CanvasTemplateRow[]).map(canvasTemplateFromRow);
}

export async function listMyCanvasTemplates(userId: string) {
    const { data, error } = await supabase.from("canvas_templates").select("*").eq("creator_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data as CanvasTemplateRow[]).map(canvasTemplateFromRow);
}

export async function listAdminCanvasTemplates() {
    const { data, error } = await supabase.from("canvas_templates").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data as CanvasTemplateRow[]).map(canvasTemplateFromRow);
}

export async function updateCanvasTemplateMetadata(input: { id: string; title: string; description: string }) {
    const { data, error } = await supabase.from("canvas_templates").update({ title: input.title.trim(), description: input.description.trim() }).eq("id", input.id).select("*").single();
    if (error) throw error;
    return canvasTemplateFromRow(data as CanvasTemplateRow);
}

export async function getCanvasTemplate(id: string) {
    const { data, error } = await supabase.from("canvas_templates").select("*").eq("id", id).single();
    if (error) throw error;
    return canvasTemplateFromRow(data as CanvasTemplateRow);
}

export async function submitCanvasTemplate(input: { project: CanvasProject; profile: UserProfile; title: string; description: string }) {
    const now = new Date().toISOString();
    const status: CanvasTemplateStatus = input.profile.role === "superuser" ? "published" : "pending";
    const { data, error } = await supabase.from("canvas_templates").insert({
        source_project_id: input.project.id,
        creator_id: input.profile.id,
        creator_name: input.profile.display_name || input.profile.username,
        title: input.title.trim(),
        description: input.description.trim(),
        document: canvasProjectDocument(input.project),
        status,
        published_at: status === "published" ? now : null,
    }).select("*").single();
    if (error) throw error;
    return canvasTemplateFromRow(data as CanvasTemplateRow);
}

export async function resubmitCanvasTemplate(input: { templateId: string; project: CanvasProject; title: string; description: string }) {
    const { data, error } = await supabase.from("canvas_templates").update({
        source_project_id: input.project.id,
        title: input.title.trim(),
        description: input.description.trim(),
        document: canvasProjectDocument(input.project),
        status: "pending",
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        published_at: null,
    }).eq("id", input.templateId).eq("status", "rejected").select("*").single();
    if (error) throw error;
    return canvasTemplateFromRow(data as CanvasTemplateRow);
}

export async function withdrawCanvasTemplate(id: string) {
    const { error } = await supabase.from("canvas_templates").update({ status: "withdrawn" }).eq("id", id).eq("status", "pending").select("id").single();
    if (error) throw error;
}

export async function reviewCanvasTemplate(input: { id: string; reviewerId: string; action: "approve" | "reject"; reason?: string }) {
    const approved = input.action === "approve";
    const now = new Date().toISOString();
    const { error } = await supabase.from("canvas_templates").update({
        status: approved ? "published" : "rejected",
        rejection_reason: approved ? null : input.reason?.trim(),
        reviewed_by: input.reviewerId,
        reviewed_at: now,
        published_at: approved ? now : null,
    }).eq("id", input.id).eq("status", "pending").select("id").single();
    if (error) throw error;
}

export function canvasTemplateFromRow(row: CanvasTemplateRow): CanvasTemplate {
    return {
        id: row.id,
        sourceProjectId: row.source_project_id,
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        title: row.title,
        description: row.description,
        document: row.document,
        status: row.status,
        rejectionReason: row.rejection_reason,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
