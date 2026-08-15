export type SharedTheme = "light" | "dark";

const THEME_COOKIE = "croco_theme";
const THEME_ENDPOINT = "/api/preferences/theme";
const THEME_EVENTS_ENDPOINT = "/api/preferences/events";

export function readSharedThemeCookie(): SharedTheme | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)(?:;|$)`));
    return asTheme(match?.[1]);
}

export function writeSharedThemeCookie(theme: SharedTheme) {
    if (typeof document === "undefined") return;
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export async function initializeSharedTheme(fallback: SharedTheme): Promise<SharedTheme> {
    try {
        const current = await requestTheme(THEME_ENDPOINT);
        if (current) {
            writeSharedThemeCookie(current);
            return current;
        }
        return await publishSharedTheme(fallback, true);
    } catch {
        return fallback;
    }
}

export async function publishSharedTheme(theme: SharedTheme, initializeOnly = false): Promise<SharedTheme> {
    writeSharedThemeCookie(theme);
    try {
        const resolved = await requestTheme(THEME_ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme, initializeOnly }),
        }) || theme;
        writeSharedThemeCookie(resolved);
        return resolved;
    } catch {
        return theme;
    }
}

export function subscribeSharedTheme(onTheme: (theme: SharedTheme) => void) {
    if (typeof EventSource === "undefined") return () => undefined;
    const source = new EventSource(THEME_EVENTS_ENDPOINT);
    const listener = (event: Event) => {
        try {
            const theme = asTheme(JSON.parse((event as MessageEvent<string>).data)?.theme);
            if (!theme) return;
            writeSharedThemeCookie(theme);
            onTheme(theme);
        } catch {
            // Ignore malformed external events; the stream will continue.
        }
    };
    source.addEventListener("theme.updated", listener);
    return () => source.close();
}

async function requestTheme(input: RequestInfo | URL, init?: RequestInit): Promise<SharedTheme | null> {
    const response = await fetch(input, { cache: "no-store", ...init });
    if (!response.ok) throw new Error(`Theme preference request failed: ${response.status}`);
    return asTheme((await response.json())?.theme);
}

function asTheme(value: unknown): SharedTheme | null {
    return value === "light" || value === "dark" ? value : null;
}
