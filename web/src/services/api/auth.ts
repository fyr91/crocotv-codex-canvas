import { supabase } from "@/lib/supabase/client";

export function internalEmail(username: string) {
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,64}$/.test(normalized)) throw new Error("请输入有效用户名");
    return `${normalized}@crocodaddy.com`;
}

export async function signInWithUsername(username: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: internalEmail(username), password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "用户名或密码错误" : error.message);
    return data;
}

export async function changePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    const { error: flagError } = await supabase.rpc("complete_password_change");
    if (flagError) throw flagError;
}

export async function getCurrentProfile() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("请先登录");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
    if (error) throw error;
    return data;
}

export async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
}
