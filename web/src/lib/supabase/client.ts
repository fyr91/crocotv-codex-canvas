import { createClient } from "@supabase/supabase-js";

// 本地画布不连接 Supabase。保留一个禁用会话的占位客户端，只为兼容仍被
// 原始 CrocoTV 画布组件静态导入、但本地路由永远不会调用的旧模块。
const url = "http://127.0.0.1:9";
const publishableKey = "local-canvas-disabled";

export const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export const USER_ASSET_BUCKET = "user-assets";
