import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MediaAssetPicker } from "./media-asset-picker";
import { VideoFramePicker } from "./video-frame-picker";

describe("exclusive media playback entry points", () => {
    it("exempts hover preview videos from the user playback session", () => {
        const html = renderToStaticMarkup(
            <MediaAssetPicker
                items={[{ id: "video", title: "预览", kind: "video", previewUrl: "preview.mp4" }]}
                allowedKinds={["video"]}
                hoverVideoPreview
                onPick={() => undefined}
            />,
        );

        expect(html).toContain("data-media-playback-exempt");
    });

    it("exempts the frame picker decoder from the user playback session", () => {
        const html = renderToStaticMarkup(
            <VideoFramePicker
                sourceUrl=""
                onTimeCommit={() => undefined}
                onCancel={() => undefined}
                onConfirm={() => undefined}
            />,
        );

        expect(html).toContain("data-media-playback-exempt");
    });
});
