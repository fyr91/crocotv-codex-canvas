"use client";

import { Moon, Sun } from "lucide-react";
import { useSettingsStore } from "@/store/settingsStore";

export default function ThemeToggle() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const isDark = theme === "dark";
  const label = isDark ? "切换到亮色主题" : "切换到深色主题";
  const toggleTheme = () => {
    const nextTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-glass-border bg-transparent text-text-muted transition-colors hover:bg-hover-bg hover:text-foreground"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="sr-only">{label}</span>
    </button>
  );
}
