import { supabase } from "@/lib/supabase/client";

export type SharedPromptNodeType = "text" | "config" | "image" | "video" | "audio" | "music";

export type SharedPrompt = {
    id: string;
    creatorId: string;
    creatorName: string;
    title: string;
    prompt: string;
    sourceNodeType: SharedPromptNodeType;
    createdAt: string;
    updatedAt: string;
};

type SharedPromptRow = {
    id: string;
    creator_id: string;
    creator_name: string;
    title: string;
    prompt: string;
    source_node_type: SharedPromptNodeType;
    created_at: string;
    updated_at: string;
};

export async function listSharedPrompts() {
    const { data, error } = await supabase.from("shared_prompts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data as SharedPromptRow[]).map(sharedPromptFromRow);
}

export async function listMySharedPrompts(userId: string) {
    const { data, error } = await supabase.from("shared_prompts").select("*").eq("creator_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data as SharedPromptRow[]).map(sharedPromptFromRow);
}

export async function createSharedPrompt(input: { creatorId: string; creatorName: string; title: string; prompt: string; sourceNodeType: SharedPromptNodeType }) {
    const { data, error } = await supabase
        .from("shared_prompts")
        .insert({ creator_id: input.creatorId, creator_name: input.creatorName, title: input.title, prompt: input.prompt, source_node_type: input.sourceNodeType })
        .select("*")
        .single();
    if (error) throw error;
    return sharedPromptFromRow(data as SharedPromptRow);
}

export async function updateSharedPrompt(id: string, patch: { title: string; prompt: string; creatorName: string }) {
    const { data, error } = await supabase.from("shared_prompts").update({ title: patch.title, prompt: patch.prompt, creator_name: patch.creatorName }).eq("id", id).select("*").single();
    if (error) throw error;
    return sharedPromptFromRow(data as SharedPromptRow);
}

export async function deleteSharedPrompt(id: string) {
    const { error } = await supabase.from("shared_prompts").delete().eq("id", id);
    if (error) throw error;
}

function sharedPromptFromRow(row: SharedPromptRow): SharedPrompt {
    return {
        id: row.id,
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        title: row.title,
        prompt: row.prompt,
        sourceNodeType: row.source_node_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
