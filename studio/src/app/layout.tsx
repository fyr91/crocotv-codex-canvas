import "./globals.css";
import "@/styles/croco-theme.css";
import { Providers } from "@/components/Providers";
import TauriDragBar from "@/components/layout/TauriDragBar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="dark" suppressHydrationWarning>
      <head>
        <title>视频工坊</title>
        <meta name="description" content="CrocoTV 本地视频生产工作台" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/(?:^|; )croco_theme=(light|dark)(?:;|$)/);var d=JSON.parse(localStorage.getItem("lumenx-settings")||"{}");var t=c?c[1]:d.state&&d.state.theme;var l=t==="light"||t==="atelier-light"||t==="brand-light";document.documentElement.className=l?"light":"dark";document.documentElement.style.colorScheme=l?"light":"dark";}catch(e){document.documentElement.className="dark";document.documentElement.style.colorScheme="dark";}})();`,
          }}
        />
        {/* Desktop app: compact font-size for embedded windows (Tauri / pywebview).
            Detection covers: Tauri protocol, Tauri global, pywebview global,
            and the production static/index.html served by backend (pywebview). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=window.location.protocol;var h=window.location.hostname;var isTauri=p==='tauri:'||window.__TAURI__||window.__TAURI_INTERNALS__||(p==='https:'&&h==='tauri.localhost');var isPywebview=!!window.pywebview||(p==='http:'&&(h==='127.0.0.1'||h==='localhost')&&window.location.pathname.indexOf('/static/')===0);if(isTauri||isPywebview){document.documentElement.style.fontSize='81.25%';}})();`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <Providers>
          <TauriDragBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
