import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        surface: "#ffffff",
        surfaceSunken: "#f5f5f4",
        surfaceOverlay: "#ffffff",
        border: "#e7e5e4",
        borderSecondary: "#f0efed",
        text: "#1c1917",
        textSecondary: "#78716c",
        menuBg: "#f5f5f5",
        menuText: "#171717",
        selectActiveBg: "#f5f5f5",
        selectSelectedBg: "#f0f0f0",
        selectText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        surface: "#1c1917",
        surfaceSunken: "#0c0a09",
        surfaceOverlay: "#292524",
        border: "#44403c",
        borderSecondary: "#292524",
        text: "#fafaf9",
        textSecondary: "#a8a29e",
        menuBg: "#262626",
        menuText: "#fafafa",
        selectActiveBg: "#262626",
        selectSelectedBg: "#333333",
        selectText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "crocotv-dark" : "crocotv-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgContainer: color.surface,
            colorBgElevated: color.surfaceOverlay,
            colorBgLayout: color.surfaceSunken,
            colorBorder: color.border,
            colorBorderSecondary: color.borderSecondary,
            colorText: color.text,
            colorTextSecondary: color.textSecondary,
            borderRadius: 10,
            borderRadiusLG: 16,
            controlHeight: 40,
            controlHeightSM: 32,
            controlHeightLG: 48,
            boxShadow: "none",
            boxShadowSecondary: dark ? "0 16px 36px rgba(0,0,0,.28)" : "0 14px 32px rgba(28,25,23,.08)",
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultShadow: "none",
                dangerShadow: "none",
            },
            Card: {
                headerBg: "transparent",
            },
            Input: {
                activeShadow: dark ? "0 0 0 3px rgba(250,250,249,.12)" : "0 0 0 3px rgba(23,23,23,.08)",
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
                headerBg: color.surfaceSunken,
            },
            Modal: {
                headerBg: color.surfaceOverlay,
                contentBg: color.surfaceOverlay,
                footerBg: color.surfaceOverlay,
            },
            Segmented: {
                trackBg: color.surfaceSunken,
                itemSelectedBg: color.surface,
                itemSelectedColor: color.text,
            },
            Tooltip: {
                colorBgSpotlight: dark ? "#fafaf9" : "#1c1917",
                colorTextLightSolid: dark ? "#1c1917" : "#ffffff",
            },
        },
    };
}
