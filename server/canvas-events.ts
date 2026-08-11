import type { Response } from "express";

export type CanvasProjectEvent = {
  type: "project.updated";
  projectId: string;
  project: Record<string, unknown>;
  originClientId?: string;
};

const projectStreams = new Map<string, Set<Response>>();

export function openProjectEventStream(projectId: string, response: Response) {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write("retry: 1000\n\n");
  const listeners = projectStreams.get(projectId) || new Set<Response>();
  listeners.add(response);
  projectStreams.set(projectId, listeners);
  const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
  response.on("close", () => {
    clearInterval(heartbeat);
    listeners.delete(response);
    if (!listeners.size) projectStreams.delete(projectId);
  });
}

export function publishProjectUpdated(project: Record<string, unknown>, originClientId?: string) {
  const projectId = String(project.id || "");
  if (!projectId) return;
  const event: CanvasProjectEvent = { type: "project.updated", projectId, project, originClientId };
  const payload = `event: project.updated\ndata: ${JSON.stringify(event)}\n\n`;
  for (const response of projectStreams.get(projectId) || []) response.write(payload);
}
