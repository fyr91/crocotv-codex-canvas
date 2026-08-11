import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RoleStep } from "./components/role-step";

describe("Course Flow role card preview", () => {
    it("clips the preview to the card's rounded top corners", () => {
        const html = renderToStaticMarkup(<RoleStep
            roles={[{ id: "role-1", creatorId: "user-1", name: "鳄鱼爸爸", description: "", designSheetAssetId: "sheet", designSheetUrl: "/sheet.png", frontAssetId: "front", frontUrl: "/front.png", voiceId: "voice", voiceName: "鳄鱼爸爸", previewAssetId: "preview", previewUrl: "/preview.mp3" }]}
            selectedRoleId="role-1"
            onSelect={vi.fn()}
            onCreate={vi.fn()}
            onNext={vi.fn()}
        />);

        expect(html).toContain("rounded-t-[11px]");
    });
});
