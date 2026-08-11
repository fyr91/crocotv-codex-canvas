import { create } from "zustand";

export type UserProfile = {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    role: "user" | "superuser";
    status: "active" | "disabled";
    must_change_password: boolean;
};
export type LocalUser = { id: string; username: string; displayName: string; avatarUrl: string };

const profile: UserProfile = { id: "local", username: "local", display_name: "本地用户", avatar_url: "", role: "user", status: "active", must_change_password: false };
type UserStore = { status: "authenticated"; profile: UserProfile; user: LocalUser; initialized: boolean; initialize: () => Promise<void>; refreshProfile: () => Promise<UserProfile>; signOut: () => Promise<void>; clearSession: () => void };

export const useUserStore = create<UserStore>()(() => ({
    status: "authenticated",
    profile,
    user: { id: profile.id, username: profile.username, displayName: profile.display_name, avatarUrl: "" },
    initialized: true,
    initialize: async () => {},
    refreshProfile: async () => profile,
    signOut: async () => {},
    clearSession: () => {},
}));
