"use client"

import { Eye, EyeOff } from "lucide-react"

import { Button } from "./ui/button"
import { cn } from "src/lib/utils"

/**
 * 密码可见性切换（那颗小眼睛）：项目里所有密码输入共用的唯一控件。
 *
 * 只负责「一颗按钮 + 状态图标 + 可访问名」，**不负责位置、也不碰输入框的 type**——
 * 位置交给 `TextField` 的 `trailing` 插槽（下划线登录框 / 描边盒设置表单都能挂），
 * `type` 的切换与显隐状态用 `@shop/app-kit` 的 `usePasswordVisibility`（i18n 在那边）。
 *
 * 鼠标按下不抢焦点：否则输入框失焦，聚焦反馈（下划线收缩、聚焦环）会跟着消失；
 * 键盘 Tab 过来仍可聚焦，焦点环照画。
 */
export function PasswordToggle({
    visible,
    onToggle,
    label,
    className,
}: {
    /** 当前是否明文显示 */
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
