import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import { router } from "@/router";

const chunkReloadKey = "crocotv:chunk-reload";

window.addEventListener("vite:preloadError", (event) => {
    const lastReload = Number(sessionStorage.getItem(chunkReloadKey));
    if (Date.now() - lastReload < 10_000) return;
    event.preventDefault();
    sessionStorage.setItem(chunkReloadKey, String(Date.now()));
    window.location.reload();
});

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
