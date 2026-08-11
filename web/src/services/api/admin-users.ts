import { supabase } from "@/lib/supabase/client";

export type AdminUser = { id: string; username: string; display_name: string; role: "user" | "superuser"; status: "active" | "disabled"; must_change_password: boolean; created_at: string; last_sign_in_at: string | null };

export async function listAdminUsers() {
    const { data, error } = await supabase.functions.invoke("admin-users", { method: "GET" });
    if (error) throw error;
    return data.users as AdminUser[];
}

export async function manageUser(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message);
    return data;
}
