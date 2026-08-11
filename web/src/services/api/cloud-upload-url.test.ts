import assert from "node:assert/strict";
import test from "node:test";

import { directStorageUploadEndpoint } from "./cloud-upload-url.ts";

test("uses the direct Storage hostname for hosted Supabase projects", () => {
    assert.equal(
        directStorageUploadEndpoint("https://abc.supabase.co"),
        "https://abc.storage.supabase.co/storage/v1/upload/resumable",
    );
});

test("keeps custom Supabase domains unchanged", () => {
    assert.equal(
        directStorageUploadEndpoint("https://supabase.example.com"),
        "https://supabase.example.com/storage/v1/upload/resumable",
    );
});
