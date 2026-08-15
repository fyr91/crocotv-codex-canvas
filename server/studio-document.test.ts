import assert from "node:assert/strict";
import test from "node:test";
import { studioDocumentToText, studioTextToDocument } from "./studio-document";

test("legacy Studio text becomes valid action nodes and round-trips", () => {
  const text = "内景. 办公室 - 日\n小明\n你好。\n\n小明拿起「钥匙」。";
  const document = studioTextToDocument(text) as { type: string; content: Array<{ type: string }> };

  assert.equal(document.type, "doc");
  assert.ok(document.content.every((node) => node.type === "action"));
  assert.equal(studioDocumentToText(document), text);
});

test("structured block nodes keep one plain-text line per block", () => {
  const document = {
    type: "doc",
    content: [
      { type: "sceneHeading", content: [{ type: "text", text: "内景. 办公室 - 日" }] },
      { type: "characterCue", content: [{ type: "text", text: "小明" }] },
      { type: "dialogue", content: [{ type: "text", text: "你好。" }] },
    ],
  };

  assert.equal(studioDocumentToText(document), "内景. 办公室 - 日\n小明\n你好。");
});
