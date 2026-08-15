"use client";
/**
 * WorkflowActionButton — R2V workflow 统一 primary action 按钮。
 *
 * 视觉灵感：ZeroNode 项目的 frosted glass pill —— pill 形状 + 顶部高光
 * + 半透明品牌色 + backdrop-blur，让按钮看起来"漂浮"在 dark glass 之上。
 *
 * 适配 LumenX：
 *   · 用紫色 #646cff 替代蓝色（与 BorderGlow / StepHeader / 整体品牌一致）
 *   · backdrop-blur 落到 LumenX 已有的 glass 语言里
 *   · 顶部 inset highlight 约 1px 白色 4-5% —— 极克制，不喧宾
 *   · 三档 variant：
 *       - primary  : 紫色填充 + 顶部高光，主行动（"应用并继续" / "Generate ×N"）
 *       - secondary: 紫色 outline + 极浅紫填充，次行动（"导入" / "保存"）
 *       - ghost    : 透明 + 紫文字 + hover 显玻璃，纯导航（"取消" / 占位）
 *   · loading 态：左前显 spinner，禁交互
 *   · disabled 态：opacity 50% + cursor not-allowed
 *
 * 禁用 motion.button 包装 —— scale-95 active 已足够，不再加 framer-motion 重器。
 */
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface WorkflowActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    /** primary = 主行动（紫色填充 frosted）
     *  secondary = 次行动（紫 outline + 极浅紫底）
     *  ghost = 纯导航（透明 + hover 显玻璃） */
    variant?: Variant;
    /** sm = 28px 高 (chrome 内嵌)；md = 36px 高（标准 step trailing）。 */
    size?: Size;
    /** 左 icon（可选）；与 children 之间有 1.5 间距。 */
    leftIcon?: ReactNode;
    /** 右 icon（可选）；常用于 ChevronRight "继续" 暗示。 */
    rightIcon?: ReactNode;
    /** loading 时左 icon 自动换 spinner，按钮禁用，文字不变。 */
    loading?: boolean;
    children: ReactNode;
}

/* ───────────────────────────────────────────────────────────────────
   Variant 风格表
   每档样式写在这里，避免 className 拼接里塞条件，可读性更好。
   ─────────────────────────────────────────────────────────────────── */
const variantStyles: Record<Variant, string> = {
    primary: clsx(
        "border border-transparent bg-primary text-on-accent",
        "hover:bg-primary-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
    ),
    secondary: clsx(
        "border border-glass-border bg-surface text-foreground",
        "hover:bg-hover-bg hover:border-border-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
    ),
    ghost: clsx(
        "text-text-secondary bg-transparent border border-transparent",
        "hover:bg-hover-bg hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
    ),
};

const sizeStyles: Record<Size, string> = {
    sm: "h-8 px-[15px] text-sm gap-1.5",
    md: "h-10 px-[15px] text-sm gap-2",
};

export default function WorkflowActionButton({
    variant = "primary",
    size = "md",
    leftIcon,
    rightIcon,
    loading = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
}: WorkflowActionButtonProps) {
    const isDisabled = disabled || loading;
    return (
        <button
            type={type}
            disabled={isDisabled}
            className={clsx(
                "inline-flex items-center justify-center rounded-lg font-normal",
                "font-sans",
                "select-none whitespace-nowrap",
                "transition-colors duration-fast ease-out-quart",
                "disabled:cursor-not-allowed disabled:opacity-45",
                sizeStyles[size],
                variantStyles[variant],
                className,
            )}
            {...rest}
        >
            {loading ? (
                <Loader2 className="animate-spin" size={size === "sm" ? 12 : 14} aria-hidden="true" />
            ) : leftIcon ? (
                <span className="grid place-items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{leftIcon}</span>
            ) : null}
            <span>{children}</span>
            {rightIcon && !loading ? (
                <span className="grid place-items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{rightIcon}</span>
            ) : null}
        </button>
    );
}
