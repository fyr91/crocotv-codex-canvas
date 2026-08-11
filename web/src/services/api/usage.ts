import { supabase } from "@/lib/supabase/client";
import { functionErrorMessage } from "./generation-client";

export type UsageSummary = { total_jobs: number; succeeded_jobs: number; failed_jobs: number; input_tokens: number; output_tokens: number; image_count: number; video_tokens: number; speech_characters: number; music_tracks: number; estimated_cost: number };
export type UsageJob = { id: string; user_id: string; capability: string; model_key: string; status: string; prompt: string; input_tokens: number | null; output_tokens: number | null; provider_tokens: number | null; duration_seconds: number | null; character_count: number | null; item_count: number | null; estimated_cost: number | null; error_message: string | null; created_at: string; user?: { username?: string; display_name?: string } };
export type UsageUserSummary = { id: string; username: string; display_name: string; totalJobs: number; succeededJobs: number; failedJobs: number; successRate: number; imageCount: number; videoTokens: number; speechCharacters: number; musicTracks: number; estimatedCost: number };
export type UsageAnalyticsUser = Pick<UsageUserSummary, "totalJobs" | "succeededJobs" | "successRate" | "videoTokens"> & { userId: string; username: string; mediaJobs: number };
export type UsageAnalytics = { categories: { text: number; image: number; video: number; audio: number }; users: UsageAnalyticsUser[] };
export type AdminUsageData = { summary: Record<string, number>; trend: Array<Record<string, unknown>>; users: UsageUserSummary[]; jobs: UsageJob[]; analytics?: UsageAnalytics };

export async function getMyUsage(days = 30) {
    const to = new Date(); const from = new Date(to.getTime() - days * 86400000);
    const [{ data: report, error: reportError }, { data: jobs, error: jobsError }] = await Promise.all([
        supabase.rpc("my_usage_summary", { from_at: from.toISOString(), to_at: to.toISOString() }),
        supabase.from("generation_jobs").select("*").gte("created_at", from.toISOString()).order("created_at", { ascending: false }).limit(200),
    ]);
    if (reportError) throw reportError; if (jobsError) throw jobsError;
    return { ...(report as { summary: UsageSummary; trend: Array<{ date: string; jobs: number; estimatedCost: number }> }), jobs: jobs as UsageJob[] };
}

export async function getAdminUsage({ from, to }: { from: Date; to: Date }) {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token; if (!token) throw new Error("登录状态已失效");
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard`); url.searchParams.set("from", from.toISOString()); url.searchParams.set("to", to.toISOString());
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
    const data = await response.json(); if (!response.ok || data?.error) throw new Error(data?.error?.message || "统计加载失败");
    return data as AdminUsageData;
}

export async function cancelGeneration(jobId: string) {
    void jobId;
}
