import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlaygroundGenerationResponse } from "@/lib/api";
import CharacterGenerationPreviewModal from "./CharacterGenerationPreviewModal";

const generation: PlaygroundGenerationResponse = {
  id: "generation-1",
  mode: "t2i",
  model_id: "openai:gpt-image@2",
  prompt: "character design sheet",
  input_media: [],
  parameters: {},
  batch_size: 1,
  outputs: [{ id: "output-1", resource_id: "resource-1", media_path: "/api/files/by-id/resource-1", media_type: "image" }],
  status: "completed",
  created_at: "2026-08-17T08:30:00.000Z",
};

describe("CharacterGenerationPreviewModal", () => {
  it("offers the same add-to-character action from the enlarged preview", () => {
    const onAttach = vi.fn();
    render(<CharacterGenerationPreviewModal generation={generation} output={generation.outputs[0]} attached={false} attaching={false} onAttach={onAttach} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "加入角色素材" }));
    expect(onAttach).toHaveBeenCalledOnce();
  });

  it("shows a status indicator instead of another attach action once added", () => {
    render(<CharacterGenerationPreviewModal generation={generation} output={generation.outputs[0]} attached attaching={false} onAttach={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("已加入素材")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加入角色素材" })).not.toBeInTheDocument();
  });
});
