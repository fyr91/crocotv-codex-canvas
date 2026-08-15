import { describe, expect, it } from "vitest";
import { resolvePlaygroundMediaType, resolvePlaygroundMediaUrl } from "@/components/modules/playground/media";

describe("Playground media resolution", () => {
  it("keeps stable Croco resource URLs instead of double-prefixing /files", () => {
    expect(resolvePlaygroundMediaUrl("/files/by-id/resource-1")).toBe("/files/by-id/resource-1");
    expect(resolvePlaygroundMediaUrl("files/by-id/resource-2")).toBe("/files/by-id/resource-2");
  });

  it("still resolves legacy Lumen X output paths through the backend files mount", () => {
    expect(resolvePlaygroundMediaUrl("output/storyboard/frame.png")).toMatch(/\/files\/storyboard\/frame\.png$/);
  });

  it("uses persisted media_type when stable resource URLs have no extension", () => {
    expect(resolvePlaygroundMediaType("video", "/files/by-id/resource-3")).toBe("video");
    expect(resolvePlaygroundMediaType("image", "/files/by-id/resource-4")).toBe("image");
  });
});
