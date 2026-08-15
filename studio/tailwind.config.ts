import type { Config } from "tailwindcss";

const semanticColor = (token: string) => (({ opacityValue }: { opacityValue?: string }) =>
  opacityValue === undefined
    ? `var(${token})`
    : `color-mix(in srgb, var(${token}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: semanticColor("--color-bg-base"),
        foreground: semanticColor("--color-text-primary"),
        surface: semanticColor("--color-bg-surface"),
        elevated: semanticColor("--color-bg-elevated"),
        "input-bg": semanticColor("--color-bg-input"),
        "hover-bg": semanticColor("--color-bg-hover"),
        glass: semanticColor("--color-glass"),
        "glass-border": semanticColor("--color-border-default"),
        "border-subtle": semanticColor("--color-border-subtle"),
        "border-strong": semanticColor("--color-border-strong"),
        "text-secondary": semanticColor("--color-text-secondary"),
        "text-muted": semanticColor("--color-text-muted"),
        overlay: semanticColor("--color-overlay"),
        "surface-inset": semanticColor("--color-bg-inset"),
        primary: semanticColor("--color-primary"),
        "primary-hover": semanticColor("--color-primary-hover"),
        secondary: semanticColor("--color-primary-hover"),
        accent: semanticColor("--color-accent"),
        "accent-hover": semanticColor("--color-accent-hover"),
        "on-accent": semanticColor("--color-on-accent"),
        "selection-indicator": semanticColor("--color-selection-indicator"),
        "selection-ink": semanticColor("--color-selection-ink"),
        "selection-border": semanticColor("--color-selection-border"),
        "selection-bg": semanticColor("--color-selection-bg"),
        // Storyboard R2V workbench status semantic tokens. Replaces
        // 30+ scattered amber/emerald/red/blue arbitrary tints. Each
        // status carries -fg / -border / -bg variants; starred also
        // has -solid for chip backgrounds. Defined in globals.css per
        // theme.
        "status-pending-fg": semanticColor("--color-status-pending-fg"),
        "status-pending-border": semanticColor("--color-status-pending-border"),
        "status-pending-bg": semanticColor("--color-status-pending-bg"),
        "status-draft-fg": semanticColor("--color-status-draft-fg"),
        "status-draft-border": semanticColor("--color-status-draft-border"),
        "status-draft-bg": semanticColor("--color-status-draft-bg"),
        "status-processing-fg": semanticColor("--color-status-processing-fg"),
        "status-processing-border": semanticColor("--color-status-processing-border"),
        "status-processing-bg": semanticColor("--color-status-processing-bg"),
        "status-completed-fg": semanticColor("--color-status-completed-fg"),
        "status-completed-border": semanticColor("--color-status-completed-border"),
        "status-completed-bg": semanticColor("--color-status-completed-bg"),
        "status-failed-fg": semanticColor("--color-status-failed-fg"),
        "status-failed-border": semanticColor("--color-status-failed-border"),
        "status-failed-bg": semanticColor("--color-status-failed-bg"),
        "status-starred-fg": semanticColor("--color-status-starred-fg"),
        "status-starred-border": semanticColor("--color-status-starred-border"),
        "status-starred-bg": semanticColor("--color-status-starred-bg"),
        "status-starred-solid": semanticColor("--color-status-starred-solid"),
        "on-warm": semanticColor("--color-on-warm"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        display: ["var(--font-display)", "var(--font-space-grotesk)", "sans-serif"],
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) * 1.8)",
        "3xl": "calc(var(--radius) * 2.2)",
        "4xl": "calc(var(--radius) * 2.6)",
      },
      boxShadow: {
        sm: "var(--elevation-card)",
        DEFAULT: "var(--elevation-card)",
        md: "var(--elevation-card-hover)",
        lg: "var(--elevation-popover)",
        xl: "var(--elevation-popover)",
        "2xl": "var(--elevation-modal)",
        inner: "none",
        none: "none",
      },
      fontSize: {
        // Canvas type protocol: caption 12/18, body 14/22,
        // supporting title 16/24, section title 20/28.
        "chrome-sm":  ["0.75rem", { lineHeight: "1.125rem", letterSpacing: "0" }],
        "chrome":     ["0.875rem", { lineHeight: "1.375rem", letterSpacing: "0" }],
        "body-sm":    ["0.875rem", { lineHeight: "1.375rem" }],
        "body":       ["0.875rem", { lineHeight: "1.375rem" }],
        "display-sm": ["1rem", { lineHeight: "1.5rem", letterSpacing: "0" }],
        "display":    ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "0" }],
      },
      transitionTimingFunction: {
        // Ease-out-quart everywhere per impeccable shared laws:
        // exponential ease-out, no bounce, no elastic.
        "out-quart": "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-expo":  "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        // 3 motion tokens. fast = state feedback (hover, focus,
        // toggle), base = enter/exit (panel mount, modal open),
        // slow = orchestrated reveals.
        "fast": "150ms",
        "base": "250ms",
        "slow": "400ms",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite linear",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
