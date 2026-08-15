import type { Response } from "express";
import path from "node:path";
import { atomicJson, dataDir, readJson } from "./storage";

export type AppTheme = "light" | "dark";

export type AppThemePreference = {
  theme: AppTheme | null;
  updatedAt: string | null;
};

export type AppThemeEvent = {
  type: "theme.updated";
  theme: AppTheme;
  updatedAt: string;
};

const preferencePath = path.join(dataDir, "preferences.json");
const themeStreams = new Set<Response>();
let preferenceQueue: Promise<unknown> = Promise.resolve();

export async function readAppThemePreference(): Promise<AppThemePreference> {
  const stored = await readJson<Partial<AppThemePreference>>(preferencePath, {});
  return {
    theme: isAppTheme(stored.theme) ? stored.theme : null,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : null,
  };
}

export function updateAppThemePreference(theme: AppTheme, initializeOnly = false): Promise<AppThemePreference> {
  const run = preferenceQueue.then(async () => {
    const current = await readAppThemePreference();
    if (initializeOnly && current.theme) return current;
    if (current.theme === theme && current.updatedAt) return current;

    const next = { theme, updatedAt: new Date().toISOString() } satisfies AppThemePreference;
    await atomicJson(preferencePath, next);
    publishThemeUpdated(next);
    return next;
  });
  preferenceQueue = run.catch(() => undefined);
  return run;
}

export async function openAppThemeEventStream(response: Response) {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write("retry: 1000\n\n");
  themeStreams.add(response);
  const current = await readAppThemePreference();
  if (current.theme && current.updatedAt) response.write(themeEventPayload(current));
  const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
  response.on("close", () => {
    clearInterval(heartbeat);
    themeStreams.delete(response);
  });
}

export function parseAppTheme(value: unknown): AppTheme {
  if (!isAppTheme(value)) throw new Error("主题必须是 light 或 dark");
  return value;
}

function publishThemeUpdated(preference: AppThemePreference) {
  if (!preference.theme || !preference.updatedAt) return;
  const payload = themeEventPayload(preference);
  for (const response of themeStreams) response.write(payload);
}

function themeEventPayload(preference: AppThemePreference) {
  const event: AppThemeEvent = { type: "theme.updated", theme: preference.theme!, updatedAt: preference.updatedAt! };
  return `event: theme.updated\ndata: ${JSON.stringify(event)}\n\n`;
}

function isAppTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "dark";
}
