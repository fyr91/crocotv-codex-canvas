"use client";

interface LumenXBrandingProps {
  size?: "sm" | "md";
}

export default function LumenXBranding({ size = "md" }: LumenXBrandingProps) {
  return (
    <span className={`${size === "sm" ? "text-sm" : "text-base"} font-medium leading-6 tracking-tight text-foreground`}>
      视频工坊
    </span>
  );
}
