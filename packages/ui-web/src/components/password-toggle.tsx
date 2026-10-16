"use client"

import { Eye, EyeOff } from "lucide-react"

import { Button } from "./ui/button"
import { cn } from "src/lib/utils"

/** 密码可见性切换（唯一控件）：只管按钮+图标+可访问名，不碰 type（切换归 usePasswordVisibility、位置归 TextField trailing）；onMouseDown preventDefault 防输入框失焦丢聚焦反馈，键盘 Tab 仍可聚焦 */
export function PasswordToggle({
    visible,
    onToggle,
    label,
    className,
}: {
    visible: boolean
    onToggle: () => void
    /** 随状态变化的可访问名（「显示密码」/「隐藏密码」），由调用点按 locale 传入 */
    label: string
    className?: string
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onToggle}
            onMouseDown={(e) => e.preventDefault()}
            className={cn("text-muted-foreground hover:text-foreground", className)}
        >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
    )
}
