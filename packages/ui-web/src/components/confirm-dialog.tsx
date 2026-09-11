import * as React from "react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./ui/alert-dialog"
import { Spinner } from "./ui/spinner"

/**
 * ConfirmDialog —— 二次确认弹窗（标题 + 说明 + 取消/确认）。
 *
 * 为什么存在：三端各自复制了十余份「AlertDialog + destructive Action」骨架，
 * 连 pending 时手写 Spinner 的接线都一模一样；散落各处时改一次视觉要改十几处，
 * 还总有调用点漏掉 disabled 或写错变体。收敛成一个语义化组件，调用点只声明意图。
 *
 * 契约要点：
 * - 关不关弹窗永远归调用方：Action 只是 Button，不会自动关闭。各调用点语义不同——
 *   有的确认即关，有的等 mutation onSuccess 才关，购物车批量删除还刻意保持打开，
 *   所以 onConfirm 里照旧自己 setState，组件不替它做主。
 * - description 传节点而非字符串：调用点要拼对象名（订单号/地址/商品名）。
 * - tone 默认 destructive，因为绝大多数二次确认是不可逆操作。
 * - pending 同时管禁用与 Spinner：这两件事本来就该同进同出，分开写必漏。
 */
export interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    /** 说明文案；需要展示具体对象名（订单号/地址…）时传节点 */
    description?: React.ReactNode
    /** 确认按钮文案，默认「确定」 */
    confirmText?: string
    cancelText?: string
    /** destructive = 不可逆操作（删除/下架/取消订单），默认 destructive */
    tone?: "destructive" | "default"
    /** 提交中：确认按钮禁用并显示 Spinner */
    pending?: boolean
    /** 确认回调；是否关闭弹窗由调用方决定（各调用点语义不同，不要在这里自动关） */
    onConfirm: () => void
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText,
    cancelText,
    tone = "destructive",
    pending,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description === undefined ? undefined : (
                        <AlertDialogDescription>{description}</AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{cancelText ?? "取消"}</AlertDialogCancel>
                    <AlertDialogAction
                        variant={tone === "destructive" ? "destructive" : undefined}
                        disabled={pending}
                        onClick={onConfirm}
                    >
                        {pending ? <Spinner /> : undefined}
                        {confirmText ?? "确定"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
