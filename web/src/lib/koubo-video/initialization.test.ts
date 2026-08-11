import { describe, expect, it } from "vitest";

import { buildKouboInitializationPath, buildVideoInitializationPath, readKouboInitialization, videoWorkflowDefinition } from "./initialization";

describe("koubo optimistic initialization", () => {
    it("keeps the preallocated project and idempotency request in a refresh-safe URL", () => {
        const path = buildKouboInitializationPath("project-id", "request-id");
        expect(path).toBe("/content/koubo-video/project-id?initialize=request-id");
        expect(readKouboInitialization("?initialize=request-id")).toEqual({ clientRequestId: "request-id" });
    });

    it("does not initialize a normal project URL", () => {
        expect(readKouboInitialization("")).toBeNull();
    });

    it("keeps course video as an independent workflow route", () => {
        expect(buildVideoInitializationPath("course-video", "project-id", "request-id"))
            .toBe("/content/course-video/project-id?initialize=request-id");
        expect(videoWorkflowDefinition("course-video")).toEqual({ label: "课程视频", routeSegment: "course-video" });
    });
});
