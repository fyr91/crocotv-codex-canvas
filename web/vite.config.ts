import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");
const localApiOrigin = process.env.CROCO_LOCAL_API_ORIGIN || "http://127.0.0.1:4399";

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    server: {
        host: "0.0.0.0",
        port: 3000,
        proxy: {
            "/api": localApiOrigin,
            "/files": localApiOrigin,
        },
    },
});
