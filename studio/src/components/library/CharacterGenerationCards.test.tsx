import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlaygroundGenerationResponse } from "@/lib/api";
import CharacterGenerationCards from "./CharacterGenerationCards";

function generation(overrides: Partial<PlaygroundGenerationResponse> = {}): PlaygroundGenerationResponse {
  return {
    id: "generation-1",
    mode: "t2i",
    model_id: "model-1",
    prompt: "角色变体",
    input_media: [],
    parameters: {},
    batch_size: 1,
    outputs: [],
    status: "pending",
    created_at: "2026-08-17T08:30:00.000Z",
    ...overrides,
  };
}

describe("CharacterGenerationCards", () => {
  it("shows an asynchronous task state without blocking the inspector", () => {
    render(<CharacterGenerationCards generations={[generation()]} attachedResourceIds={new Set()} onAttach={vi.fn()} />);
    expect(screen.getByText("等待生成")).toBeInTheDocument();
  });

  it("attaches each completed output independently and marks attached results", () => {
    const onAttach = vi.fn();
    const completed = generation({
      status: "completed",
      outputs: [
        { id: "output-1", resource_id: "resource-1", media_path: "/api/files/by-id/resource-1", media_type: "image" },
        { id: "output-2", resource_id: "resource-2", media_path: "/api/files/by-id/resource-2", media_type: "image" },
      ],
    });
    render(<CharacterGenerationCards generations={[completed]} attachedResourceIds={new Set(["resource-1"])} onAttach={onAttach} />);

    expect(screen.queryByText("已加入素材")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "已加入素材" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已加入素材" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "加入角色素材" }));
    expect(onAttach).toHaveBeenCalledWith(completed, "resource-2");
  });
});
