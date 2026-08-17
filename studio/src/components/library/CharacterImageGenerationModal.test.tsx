import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock("@/lib/api", () => ({ playgroundApi: { generate } }));
vi.mock("@/components/modules/playground/playgroundModels", () => ({
  getDefaultModelForMode: () => "image-model",
  getModelsForMode: () => [{ id: "image-model", displayName: "Image Model", maxReferenceImages: 3 }],
}));

import CharacterImageGenerationModal from "./CharacterImageGenerationModal";

const character = {
  id: "character-1",
  name: "小林",
  description: "少年角色",
  reference_sheet: { image_variants: [] },
} as any;

describe("CharacterImageGenerationModal", () => {
  beforeEach(() => generate.mockReset());

  it("closes immediately after the server accepts the generation task", async () => {
    const task = { id: "generation-1", status: "pending" };
    generate.mockResolvedValue(task);
    const onClose = vi.fn();
    const onTaskCreated = vi.fn();
    render(<CharacterImageGenerationModal character={character} onClose={onClose} onTaskCreated={onTaskCreated} />);

    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));
    await waitFor(() => expect(onTaskCreated).toHaveBeenCalledWith(task));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("can be closed while task creation is still in flight", async () => {
    let resolveTask!: (value: { id: string; status: string }) => void;
    generate.mockReturnValue(new Promise((resolve) => { resolveTask = resolve; }));
    const onClose = vi.fn();
    const onTaskCreated = vi.fn();
    render(<CharacterImageGenerationModal character={character} onClose={onClose} onTaskCreated={onTaskCreated} />);

    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    expect(onClose).toHaveBeenCalledOnce();
    resolveTask({ id: "generation-2", status: "pending" });
    await waitFor(() => expect(onTaskCreated).toHaveBeenCalled());
  });
});
