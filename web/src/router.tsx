import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import RouteErrorPage from "@/pages/error";
import NotFound from "@/pages/not-found";

export const router = createBrowserRouter([
    {
        errorElement: <RouteErrorPage />,
        element: <UserLayout><Outlet /></UserLayout>,
        children: [
            { path: "/", element: <Navigate to="/canvas" replace /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/assets", element: <AssetsPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
