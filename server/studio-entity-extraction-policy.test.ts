import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { entityExtractionRequestPolicy } from "./studio-workflow";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("unchanged automatic extraction skips the model", () => {
  const text = "第一场：小林进入森林";
  const policy = entityExtractionRequestPolicy({ sourceText: text, sourceHash: hash(text) }, text, false);

  assert.equal(policy.skip, true);
  assert.equal(policy.allowReusable, true);
  assert.deepEqual(policy.scriptContext, { mode: "unchanged", current_text: "" });
});

test("manual extraction always scans the full script and bypasses completed-result reuse", () => {
  const text = "第一场：小林进入森林";
  const policy = entityExtractionRequestPolicy({ sourceText: text, sourceHash: hash(text) }, text, true);

  assert.equal(policy.skip, false);
  assert.equal(policy.allowReusable, false);
  assert.deepEqual(policy.scriptContext, { mode: "full", current_text: text });
});
